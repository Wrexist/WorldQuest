import { AccountChangedError, type AccountRepository } from '@worldquest/api'
import { accountRepository, currentUser } from './supabase.js'
import { captureStorage } from './storage.js'

/** Both transport credentials and completion belong to the original account. */
export async function withAccount<T>(work: (account: AccountRepository) => Promise<T>): Promise<T> {
  const original = captureStorage()
  const { userId } = await currentUser()
  if (!original.isCurrent() || (original.userId !== null && original.userId !== userId)) throw new AccountChangedError()
  const account = await accountRepository(userId)
  if (!original.isCurrent()) throw new AccountChangedError()
  const result = await work(account)
  if (!original.isCurrent()) throw new AccountChangedError()
  return result
}
