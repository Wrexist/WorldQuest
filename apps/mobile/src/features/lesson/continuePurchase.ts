/**
 * Paying for the "Keep going" button.
 *
 * ## What was here before
 *
 * Nothing. `BALANCE.prices.continueLesson` has read 250 since the balance table was
 * written, `OutOfHearts` printed it on the button and refused the offer below it, and
 * `lesson.revive()` dispatched `REVIVE` and stopped. There was no client call and no
 * endpoint — grep `continueLesson` and the hits were the balance table, a test asserting
 * it is positive, and the label. The one paid convenience in the product was free and
 * unlimited, and the economy simulation counted its sink.
 *
 * ## Optimistic, like every other spend on this device
 *
 * The revive happens in the same frame and the coins are taken behind it, which is the
 * bargain `useShop.buy()` already makes and for the reason it states: there is no version
 * of "your purchase failed, try again" that belongs in front of a child mid-lesson. The
 * server is still the authority — `continue_lesson` reads the price from `shop_items` and
 * the user from `auth.uid()`, and the `coins >= 0` check refuses an overdraft — and the
 * wallet query is invalidated so the real balance replaces the optimistic one.
 *
 * ## Why the offer is withheld offline
 *
 * A spend that cannot reach the server is a continue nobody pays for, and unlike a
 * cosmetic there is no reconcile that can take it back afterwards: the lesson is over by
 * the time anyone could. A user offline with 5,000 coins would have unlimited free
 * continues, which is the exploit this module exists to close rather than move. So the
 * screen offers `common:offline.action` instead — the same treatment the shop and the
 * streak freeze already give a purchase that needs a connection.
 *
 * ## The idempotency key
 *
 * One UUID per OFFER, not per lesson. A lesson can empty its hearts more than once — a
 * revive restores the full set — so keying on the lesson would read a genuine second
 * continue as a replay and hand it over free.
 */

import { buyLessonContinue } from '@worldquest/api'
import { isConfigured, supabase, currentUser } from '../../lib/supabase.js'
import { invalidateProgress } from '../../lib/query.js'

export async function payForContinue(continueId: string): Promise<void> {
  if (!isConfigured()) return
  try {
    await currentUser()
    const result = await buyLessonContinue(supabase(), continueId)
    // The wallet moved, so whatever is showing a coin balance is now wrong. `already_paid`
    // counts: it means an earlier attempt landed, and this device may not have seen the
    // balance it produced.
    if (result.status === 'purchased' || result.status === 'already_paid') invalidateProgress()
  } catch {
    // Swallowed on purpose, exactly as `useShop.spend` swallows. The lesson carries on
    // either way; interrupting a child mid-lesson with a failed-payment dialogue is the
    // one outcome worse than a continue that went unbilled.
  }
}
