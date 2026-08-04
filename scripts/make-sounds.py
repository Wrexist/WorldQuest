"""
Synthesise WorldQuest's sound set.

## Why generated rather than sourced

The Definition of Done has carried "sound respects the Settings toggle" as blocked on
assets since the first week, next to flags and landmarks. That was half right. Flags
are blocked because a national flag is somebody's artwork with a licence attached. A
correct-answer chime is not: it is a sine wave with an envelope, and generating it
means the project owns it outright with no licence to track, no attribution to carry,
and no takedown to worry about.

The distinction is the same one `content-pipeline.md` draws about facts: we cannot
invent a capital city, and we absolutely can author a note.

## The rules these follow (design-system.md §9)

- Under 600 ms. Anything longer is still playing when the next question arrives.
- One key — C major — so two sounds overlapping never clash.
- **Wrong is not a buzzer.** It is a gentle two-note fall, the audio equivalent of the
  muted surface `AnswerOption` uses. This app does not punish a child for not knowing
  something yet, and a descending minor third is "not that one", where a buzzer is
  "you failed". `voice-and-tone.md` is the authority and it is not negotiable.
- Every sound fades out. A hard cut is a click on cheap phone speakers.

Run: python3 scripts/make-sounds.py
Writes 16-bit mono 44.1 kHz WAVs to apps/mobile/assets/sounds/.
"""

import math
import os
import struct
import wave

RATE = 44_100
OUT = os.path.join(os.path.dirname(__file__), "..", "apps", "mobile", "assets", "sounds")

# C major. Named rather than numeric so the intent survives someone retuning them.
NOTE = {
    "C4": 261.63, "D4": 293.66, "E4": 329.63, "F4": 349.23,
    "G4": 392.00, "A4": 440.00, "B4": 493.88,
    "C5": 523.25, "D5": 587.33, "E5": 659.25, "G5": 783.99, "C6": 1046.50,
}


def tone(freq, ms, *, volume=0.32, harmonic=0.25, attack_ms=6, release_ms=90):
    """One note: a sine with a little second harmonic, under an envelope.

    The harmonic keeps it from sounding like a hearing test. The envelope is what
    stops it clicking — a raw sine that starts and ends mid-cycle pops on a phone
    speaker, which reads as a defect rather than a sound.
    """
    n = int(RATE * ms / 1000)
    attack = max(1, int(RATE * attack_ms / 1000))
    release = max(1, int(RATE * release_ms / 1000))
    out = []
    for i in range(n):
        t = i / RATE
        sample = math.sin(2 * math.pi * freq * t)
        sample += harmonic * math.sin(2 * math.pi * freq * 2 * t)
        if i < attack:
            sample *= i / attack
        elif i > n - release:
            # Cosine taper rather than linear: a linear fade is still audible as a
            # corner at this length.
            sample *= 0.5 * (1 + math.cos(math.pi * (i - (n - release)) / release))
        out.append(sample * volume)
    return out


def mix(*layers):
    """Overlay equal-length-or-shorter layers, clipped to the longest."""
    length = max(len(layer) for layer in layers)
    out = [0.0] * length
    for layer in layers:
        for i, sample in enumerate(layer):
            out[i] += sample
    return out


def after(delay_ms, samples):
    """Same layer, delayed — for arpeggios."""
    return [0.0] * int(RATE * delay_ms / 1000) + samples


def write(name, samples):
    path = os.path.join(OUT, f"{name}.wav")
    with wave.open(path, "w") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        frames = b"".join(
            struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32_000)) for s in samples
        )
        f.writeframes(frames)
    ms = len(samples) / RATE * 1000
    assert ms < 600, f"{name} is {ms:.0f}ms — §9 says under 600"
    print(f"  ✓ {name:<10} {ms:6.0f} ms  {os.path.getsize(path) / 1024:5.1f} KB")


os.makedirs(OUT, exist_ok=True)
print("Sounds (C major, all under 600 ms)\n")

# Correct — a rising major third into the fifth. Open, unmistakably "yes".
write("correct", mix(
    tone(NOTE["E5"], 150, release_ms=70),
    after(90, tone(NOTE["G5"], 220, volume=0.28)),
))

# Wrong — a gentle falling major second. NOT a buzzer, NOT a minor second (which is
# the sound of a mistake in every film score ever written). It says "not that one"
# and then gets out of the way.
write("wrong", mix(
    tone(NOTE["D4"], 140, volume=0.22, harmonic=0.12, release_ms=80),
    after(100, tone(NOTE["C4"], 240, volume=0.20, harmonic=0.10)),
))

# Unlock — a C major arpeggio. The one moment allowed to sound like a reward.
write("unlock", mix(
    tone(NOTE["C5"], 120, volume=0.26),
    after(70, tone(NOTE["E5"], 120, volume=0.26)),
    after(140, tone(NOTE["G5"], 260, volume=0.28)),
))

# Level up — the same shape an octave taller, ending on the tonic so it resolves.
write("levelup", mix(
    tone(NOTE["G4"], 110, volume=0.24),
    after(70, tone(NOTE["C5"], 110, volume=0.26)),
    after(140, tone(NOTE["E5"], 110, volume=0.26)),
    after(210, tone(NOTE["C6"], 300, volume=0.30)),
))

# Streak — two quick fifths, a little urgent, still warm.
write("streak", mix(
    tone(NOTE["G4"], 100, volume=0.24),
    after(110, tone(NOTE["D5"], 240, volume=0.26)),
))

# Tap — barely there. A confirmation, not an event.
write("tap", tone(NOTE["C5"], 45, volume=0.14, harmonic=0.05, release_ms=30))

print("\n✓ six sounds written. Generated, so the project owns them outright —")
print("  no licence to track, no attribution to carry.\n")
