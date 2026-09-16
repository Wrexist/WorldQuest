package expo.modules.securestore;

import android.content.SharedPreferences;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.*;

/** Exercises the installed native patch against SharedPreferences' cache-before-disk semantics. */
public class SecureStoreCommitTest {
  static final class Store {
    final Map<String, String> cache = new HashMap<>();
    final Map<String, String> disk = new HashMap<>();
    int failures;
    SharedPreferences prefs() {
      return (SharedPreferences) Proxy.newProxyInstance(getClass().getClassLoader(),
        new Class<?>[]{SharedPreferences.class}, (proxy, method, args) -> {
          if (method.getName().equals("getString")) return cache.get(args[0]);
          if (method.getName().equals("edit")) return editor();
          throw new AssertionError("Unexpected preference operation: " + method.getName());
        });
    }
    SharedPreferences.Editor editor() {
      final String[] update = new String[2];
      return (SharedPreferences.Editor) Proxy.newProxyInstance(getClass().getClassLoader(),
        new Class<?>[]{SharedPreferences.Editor.class}, (proxy, method, args) -> {
          if (method.getName().equals("putString")) {
            update[0] = (String) args[0]; update[1] = (String) args[1]; return proxy;
          }
          if (method.getName().equals("commit")) {
            // Android changes the process cache even when the disk operation fails.
            if (update[1] == null) cache.remove(update[0]); else cache.put(update[0], update[1]);
            if (failures > 0) { failures--; return false; }
            disk.clear(); disk.putAll(cache); return true;
          }
          throw new AssertionError("Unexpected editor operation: " + method.getName());
        });
    }
  }
  private boolean commit(Store store, String value) throws Exception {
    Method method = SecureStoreModule.class.getDeclaredMethod("commitWithRollback", SharedPreferences.class, String.class, String.class);
    method.setAccessible(true);
    return (Boolean) method.invoke(new SecureStoreModule(), store.prefs(), "session", value);
  }
  @Test public void failedNewWriteDoesNotBecomeReadableOrMakeRetryANoop() throws Exception {
    Store store = new Store(); store.failures = 1;
    assertFalse(commit(store, "A"));
    assertNull(store.cache.get("session")); assertNull(store.disk.get("session"));
    assertTrue(commit(store, "A")); assertEquals("A", store.disk.get("session"));
  }
  @Test public void failedReplacementRestoresPriorValueEvenIfRollbackDiskWriteFails() throws Exception {
    Store store = new Store(); assertTrue(commit(store, "A")); store.failures = 2;
    assertFalse(commit(store, "B"));
    assertEquals("A", store.cache.get("session")); assertEquals("A", store.disk.get("session"));
    assertTrue(commit(store, "B")); assertEquals("B", store.disk.get("session"));
  }
  @Test public void failedDeletionRemainsDiscoverableForLogoutRetry() throws Exception {
    Store store = new Store(); assertTrue(commit(store, "A")); store.failures = 1;
    assertFalse(commit(store, null));
    assertEquals("A", store.cache.get("session")); assertEquals("A", store.disk.get("session"));
    assertTrue(commit(store, null)); assertNull(store.cache.get("session")); assertNull(store.disk.get("session"));
  }
}
