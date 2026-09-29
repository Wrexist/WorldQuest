// WorldQuest website: nav state, scroll reveals, hero parallax, phone tilt and the 3D
// showroom. Everything here is decoration on top of a page that already works without
// it, and all of it stands down when the reader asks for reduced motion.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

  // Nav: glass once the page moves.
  const nav = document.getElementById('nav')
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', scrollY > 24)
    addEventListener('scroll', onScroll, { passive: true })
    onScroll()
  }

  // Reveal on scroll.
  const revealed = document.querySelectorAll('.reveal')
  if (reduce || !('IntersectionObserver' in window)) {
    revealed.forEach(el => el.classList.add('in'))
  } else {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })
    revealed.forEach(el => io.observe(el))
  }

  // Hero parallax: layers drift with the pointer by their data-depth.
  const hero = document.querySelector('.hero')
  const layers = hero ? hero.querySelectorAll('[data-depth]') : []
  if (hero && layers.length && !reduce && matchMedia('(pointer: fine)').matches) {
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0
    const tick = () => {
      x += (tx - x) * 0.08; y += (ty - y) * 0.08
      layers.forEach(l => {
        const d = parseFloat(l.dataset.depth)
        l.style.translate = `${(x * d * 18).toFixed(2)}px ${(y * d * 14).toFixed(2)}px`
      })
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(tick) : 0
    }
    hero.addEventListener('pointermove', e => {
      const r = hero.getBoundingClientRect()
      tx = (e.clientX - r.left) / r.width - 0.5
      ty = (e.clientY - r.top) / r.height - 0.5
      if (!raf) raf = requestAnimationFrame(tick)
    })
  }

  // Phones straighten up as they reach the middle of the screen.
  const phones = document.querySelectorAll('[data-tilt]')
  if (phones.length && !reduce) {
    let ticking = false
    const update = () => {
      ticking = false
      const mid = innerHeight / 2
      phones.forEach(p => {
        const r = p.getBoundingClientRect()
        const t = Math.max(-1, Math.min(1, (r.top + r.height / 2 - mid) / innerHeight))
        p.style.setProperty('--rx', `${(t * 10).toFixed(2)}deg`)
      })
    }
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update) } }, { passive: true })
    update()
  }

  // Count the hero numbers up once.
  if (!reduce) {
    document.querySelectorAll('[data-count]').forEach(el => {
      const end = +el.dataset.count, start = performance.now(), dur = 1400
      el.textContent = '0'
      const step = now => {
        const k = Math.min(1, (now - start) / dur), eased = 1 - Math.pow(1 - k, 3)
        el.textContent = Math.round(end * eased)
        if (k < 1) requestAnimationFrame(step)
      }
      setTimeout(() => requestAnimationFrame(step), 300)
    })
  }

  // Motion off for the 3D models too: no spin, no idle animation.
  if (reduce) {
    customElements.whenDefined('model-viewer').then(() => {
      document.querySelectorAll('model-viewer').forEach(m => { m.autoRotate = false; m.removeAttribute('autoplay') })
    })
  }

  // Showroom: one viewer, six models.
  const viewer = document.getElementById('showcase')
  const buttons = document.querySelectorAll('.picker button')
  const title = document.getElementById('detail-title')
  const body = document.getElementById('detail-body')
  const play = () => {
    if (reduce || !viewer.dataset.anim) return
    viewer.animationName = viewer.dataset.anim
    viewer.currentTime = 0
    viewer.play({ repetitions: 1 })
  }
  if (viewer) {
    viewer.addEventListener('load', play)
    viewer.addEventListener('click', play)
    viewer.dataset.anim = buttons[0]?.dataset.anim || ''
  }
  buttons.forEach(b => b.addEventListener('click', () => {
    buttons.forEach(o => o.setAttribute('aria-pressed', String(o === b)))
    viewer.dataset.anim = b.dataset.anim || ''
    viewer.alt = `A 3D ${b.dataset.title.toLowerCase()}`
    viewer.src = `assets/models/${b.dataset.model}.glb`
    title.textContent = b.dataset.title
    body.textContent = b.dataset.body
  }))
})()
