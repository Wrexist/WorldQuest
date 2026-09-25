/**
 * "Report a problem" with the question just answered — the flag on Duolingo's answer
 * sheet, and content-pipeline §6's in-app report (a wrong fact is a P1 bug).
 *
 * ## Reasons, never free text
 *
 * Five reasons cover what a learner can tell us about a fact: it is wrong, unclear, out
 * of date, offensive, or something else. A text box would collect whatever a child types
 * into it, which is personal data to hold, moderate and erase, for no gain: a wrong fact
 * is found from the fact id and the reason.
 *
 * ## Shape
 *
 * A full screen that replaces the lesson while it is open, like `Paused`, so the question
 * underneath is not left in the accessibility tree. One primary action, disabled until a
 * reason is chosen. After sending it says thank you and hands back to the lesson; a
 * failure says so plainly and keeps the choice for a retry. Never blocks the lesson: the
 * answer has already been graded, and closing returns to the sheet it came from.
 */

import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button, Card, colors, space, text } from '@worldquest/design'
import { useT } from '../../lib/i18n.js'
import { ChoiceRow } from '../../components/SettingsRow.js'

import type { ReportReason } from '@worldquest/api'

export const REPORT_REASONS: readonly ReportReason[] = ['wrong', 'unclear', 'outdated', 'offensive', 'other']

export type ReportSheetProps = {
  readonly onSend: (reason: ReportReason) => Promise<void>
  readonly onClose: () => void
}

export function ReportSheet({ onSend, onClose }: ReportSheetProps) {
  const t = useT()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [state, setState] = useState<'choosing' | 'sending' | 'sent' | 'failed'>('choosing')

  const send = async () => {
    if (reason === null) return
    setState('sending')
    try {
      await onSend(reason)
      setState('sent')
    } catch {
      setState('failed')
    }
  }

  return (
    <View style={styles.backdrop}>
      <Card level={3} style={styles.card}>
        <Text style={styles.title} role="heading">
          {t(state === 'sent' ? 'lesson:report.thanks.title' : 'lesson:report.title')}
        </Text>
        {state === 'sent' ? (
          <>
            <Text style={styles.body}>{t('lesson:report.thanks.body')}</Text>
            <Button label={t('common:continue')} onPress={onClose} />
          </>
        ) : (
          <>
            {/* `''` is "nothing chosen yet": it matches no choice, so none reads as selected. */}
            <ChoiceRow<ReportReason | ''>
              label={t('lesson:report.question')}
              choices={REPORT_REASONS.map((value) => ({ value, label: t(`lesson:report.reason.${value}` as 'lesson:report.reason.wrong') }))}
              value={reason ?? ''}
              onChange={(value) => setReason(value === '' ? null : value)}
            />
            {state === 'failed' && (
              <Text style={styles.body} role="alert">
                {t('lesson:report.failed')}
              </Text>
            )}
            <Button
              label={t('lesson:report.send')}
              onPress={() => void send()}
              disabled={reason === null || state === 'sending'}
            />
            <Button label={t('lesson:report.cancel')} variant="ghost" onPress={onClose} />
          </>
        )}
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[5] },
  card: { gap: space[3], width: '100%' },
  title: { ...text('h2'), color: colors.text.primary, textAlign: 'center' },
  body: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },
})
