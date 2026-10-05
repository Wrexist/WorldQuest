import type { ContentIndex, Question } from '@worldquest/engines'

/** Upgrade cached described-picture tickets without changing their grading identity. */
export function visualQuestion(question: Question, index: ContentIndex | undefined, screenReader: boolean): Question {
  if (screenReader || index === undefined || question.modality !== 'text' || question.revealAsset === undefined) return question
  const visual = [...index.templates.values()].find(template =>
    template.modality === 'image' && template.a11y.equivalentTemplate === question.item.templateId && (template.prompt.params?.length ?? 0) === 0,
  )
  if (visual === undefined) return question
  const { revealAsset, ...original } = question
  return { ...original, modality: 'image', promptKey: visual.prompt.key, promptParams: {}, promptAsset: revealAsset }
}
