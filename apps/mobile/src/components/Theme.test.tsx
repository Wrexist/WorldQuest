import { useState } from 'react'
import { View } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Button, Card, colors, darkColors, setAppearance } from '@worldquest/design'

afterEach(() => setAppearance('system'))

function StatefulLesson() {
  const [answer, setAnswer] = useState(false)
  return <Card testID="theme-card"><View>
    <Button label={answer ? 'Selected answer' : 'Choose answer'} onPress={() => setAnswer(true)} />
  </View></Card>
}

describe('live semantic appearance', () => {
  it('updates already mounted module styles without resetting the selected answer', () => {
    setAppearance('light')
    render(<StatefulLesson />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose answer' }))
    expect(getComputedStyle(screen.getByTestId('theme-card')).backgroundColor).toBe('rgb(255, 255, 255)')
    act(() => setAppearance('dark'))
    expect(getComputedStyle(screen.getByTestId('theme-card')).backgroundColor).toBe('rgb(20, 45, 64)')
    expect(screen.getByRole('button', { name: 'Selected answer' })).toBeTruthy()
    act(() => setAppearance('light'))
    expect(screen.getByRole('button', { name: 'Selected answer' })).toBeTruthy()
  })

  it('has the same semantic keys in both palettes', () => {
    const keys = (value: object, prefix = ''): string[] => Object.entries(value).flatMap(([key, child]) =>
      child && typeof child === 'object' && !Array.isArray(child)
        ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`])
    expect(keys(darkColors)).toEqual(keys(colors))
  })
})
