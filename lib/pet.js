/**
 * dsh-leike-pet — 浏览器半侧
 * ---------------------------------------------------------------------------
 * 会话窗口里的一只像素桌宠「小红帽蕾克」：
 *   · 透明背景、无边框、置顶（fixed 覆盖层，只有精灵本体接收鼠标事件）
 *   · 在会话窗口底部左右缓慢走动，偶尔停下待机、左右张望、蹦一下
 *   · 鼠标靠近时停下并把头转向鼠标
 *   · 双击原地休息（闭眼 + Zzz），再双击继续走动
 *   · 右键打开设置面板，可把大小调到 2×~7×（整数倍，像素永远不糊）
 *
 * 依赖：/dsh-pet/frame-*.png（由 tools/build_sprites.py 生成，原始像素尺寸 27×32）。
 * 纯 DOM 实现，不依赖 React / 客户端插件运行时。
 */
;(function () {
  'use strict'

  if (window.__DSH_PET_BOOTED__) return
  window.__DSH_PET_BOOTED__ = true

  var BASE = (function () {
    if (typeof window.__DSH_PET_BASE__ === 'string' && window.__DSH_PET_BASE__) return window.__DSH_PET_BASE__
    var script = document.currentScript
    try {
      if (script && script.src) return new URL('.', script.src).href
    } catch (err) { /* noop */ }
    return '/dsh-pet/'
  })()

  var FRAME_URL = {
    front: BASE + 'frame-front.png',
    left: BASE + 'frame-left.png',
    right: BASE + 'frame-right.png',
    back: BASE + 'frame-back.png',
    sleep: BASE + 'frame-front-sleep.png',
    frontBlink: BASE + 'frame-front-blink.png',
    leftBlink: BASE + 'frame-left-blink.png',
    rightBlink: BASE + 'frame-right-blink.png'
  }

  var NATIVE_W = 27            // 原始像素尺寸（精灵图就是这么大，前端整数放大）
  var NATIVE_H = 32

  /* ── 行为参数（想改手感就改这里） ───────────────────────────────────── */
  var SPEED = 26                 // 走动速度 px/s（慢悠悠）
  var ALERT_RADIUS = 220         // 鼠标进入这个半径就转头看你
  var ALERT_LEAVE_RADIUS = 255   // 离开这个半径才恢复
  var ALERT_HOLD_MS = 2600       // 鼠标停在原地超过这个时间就继续走动
  var IDLE_MIN = 1600            // 停下待机时长
  var IDLE_MAX = 4200
  var WALK_BURST_MIN = 6500      // 连续走多久后随机停一下
  var WALK_BURST_MAX = 13000
  var EDGE_PAD = 8               // 距离会话窗口左右边缘的最小间距
  var FOLLOW_HEAD_Y = 0.72       // 头部中心在精灵高度中的位置（0=底部, 1=顶部）
  var FLOOR_LERP = 9             // 地面高度跟随变化的速度
  var MEASURE_EVERY = 400        // 重新量会话窗口的间隔 ms

  var SCALE_MIN = 2              // 大小：整数倍放大
  var SCALE_MAX = 7
  var SCALE_DEFAULT = 4

  var BLINK_MIN = 2600           // 随机眨眼间隔
  var BLINK_MAX = 7600
  var BLINK_MS = 140
  var LOOK_MIN = 2200            // 待机时左右张望的间隔
  var LOOK_MAX = 5400
  var LOOK_MS_MIN = 700
  var LOOK_MS_MAX = 1500
  var TURN_MS = 170              // 走到边界掉头时露一下背影
  var HOP_MS = 420               // 待机时偶尔蹦一下
  var HOP_CHANCE = 0.35

  var STORAGE_KEY = 'dsh-pet:scale'

  /* ── 样式 ──────────────────────────────────────────────────────────── */
  var CSS = [
    '#dsh-pet-root{position:fixed;inset:0;z-index:2147482999;pointer-events:none;' +
      'overflow:visible;contain:layout style;}',
    // 无背景、无边框：覆盖层完全透明，只有精灵本身参与命中测试。
    '#dsh-pet-root .dsh-pet-actor{position:absolute;left:0;top:0;will-change:transform;' +
      'pointer-events:none;user-select:none;-webkit-user-select:none;cursor:pointer;' +
      'opacity:0;transition:opacity .35s ease;}',
    '#dsh-pet-root .dsh-pet-actor.is-ready{opacity:1;}',
    '#dsh-pet-root .dsh-pet-img{display:block;width:100%;height:100%;image-rendering:pixelated;' +
      'image-rendering:-moz-crisp-edges;pointer-events:auto;cursor:pointer;' +
      'filter:drop-shadow(0 2px 1px rgba(0,0,0,.28));}',
    '#dsh-pet-root .dsh-pet-zzz{position:absolute;left:54%;bottom:90%;display:none;z-index:2;' +
      'font:600 11px/1 ui-monospace,SFMono-Regular,Consolas,monospace;color:#fff;' +
      'letter-spacing:1.5px;pointer-events:none;white-space:nowrap;padding:3px 7px;' +
      'border-radius:999px;background:rgba(22,18,28,.72);box-shadow:0 2px 6px rgba(0,0,0,.28);}',
    '#dsh-pet-root .dsh-pet-actor.is-rest .dsh-pet-zzz{display:block;animation:dsh-pet-zzz 3s ease-in-out infinite;}',
    '@keyframes dsh-pet-zzz{0%,100%{opacity:.8;transform:translateY(0)}50%{opacity:1;transform:translateY(-4px)}}',
    // 设置面板
    '#dsh-pet-root .dsh-pet-panel{position:fixed;z-index:3;width:196px;box-sizing:border-box;' +
      'padding:10px 12px 11px;border-radius:12px;background:rgba(22,18,28,.93);color:#fff;' +
      'font:12px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;' +
      'box-shadow:0 12px 28px rgba(0,0,0,.38);border:1px solid rgba(255,255,255,.13);' +
      'pointer-events:auto;user-select:none;-webkit-user-select:none;}',
    '#dsh-pet-root .dsh-pet-panel[hidden]{display:none;}',
    '#dsh-pet-root .dsh-pet-panel-title{display:flex;align-items:center;justify-content:space-between;' +
      'font-weight:600;letter-spacing:.02em;margin-bottom:7px;}',
    '#dsh-pet-root .dsh-pet-panel-close{border:none;background:transparent;color:rgba(255,255,255,.6);' +
      'font:600 14px/1 inherit;cursor:pointer;padding:2px 4px;border-radius:6px;}',
    '#dsh-pet-root .dsh-pet-panel-close:hover{color:#fff;background:rgba(255,255,255,.1);}',
    '#dsh-pet-root .dsh-pet-panel-row{display:flex;align-items:center;gap:8px;margin:3px 0 1px;}',
    '#dsh-pet-root .dsh-pet-panel-row span:first-child{color:rgba(255,255,255,.72);white-space:nowrap;}',
    '#dsh-pet-root .dsh-pet-panel-row input[type=range]{flex:1;min-width:0;height:18px;margin:0;' +
      'accent-color:#e2564a;cursor:pointer;}',
    '#dsh-pet-root .dsh-pet-panel-value{min-width:26px;text-align:right;font-variant-numeric:tabular-nums;' +
      'color:#ffd9a8;font-weight:600;}',
    '#dsh-pet-root .dsh-pet-panel-hint{margin-top:7px;font-size:11px;line-height:1.5;color:rgba(255,255,255,.55);}',
    '@media (prefers-reduced-motion:reduce){' +
      '#dsh-pet-root .dsh-pet-img{transition:none;animation:none!important;}' +
      '#dsh-pet-root .dsh-pet-zzz{animation:none!important;}}'
  ].join('')

  /* ── 小工具 ────────────────────────────────────────────────────────── */
  function clamp(v, lo, hi) {
    if (!isFinite(lo)) lo = v
    if (!isFinite(hi)) hi = v
    if (hi < lo) hi = lo
    return v < lo ? lo : v > hi ? hi : v
  }
  function rand(lo, hi) {
    return lo + Math.random() * (hi - lo)
  }
  function readScale() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY)
      var n = parseInt(raw, 10)
      if (isFinite(n)) return clamp(n, SCALE_MIN, SCALE_MAX)
    } catch (err) { /* 隐私模式 / 被禁用 */ }
    return SCALE_DEFAULT
  }
  function writeScale(value) {
    try { window.localStorage.setItem(STORAGE_KEY, String(value)) } catch (err) { /* noop */ }
  }

  /* ── 状态 ──────────────────────────────────────────────────────────── */
  var root = null
  var actor = null
  var img = null
  var zzz = null
  var panel = null
  var panelRange = null
  var panelValue = null
  var panelOpen = false

  var ready = false
  var destroyed = false
  var rafId = 0
  var lastTs = 0
  var measureClock = 0

  var scale = readScale()
  var spriteW = NATIVE_W * scale
  var spriteH = NATIVE_H * scale

  var x = 0
  var floor = 0
  var targetFloor = 0
  var minX = 0
  var maxX = 0
  var dir = 1
  var walkClock = 0

  var state = 'walk'          // walk | idle | alert | rest
  var pose = 'front'
  var stateTimer = 0          // idle 剩余时间
  var burstTimer = 0          // 距离下次随机待机
  var pendingDir = 1
  var resting = false

  var mouse = { x: -9999, y: -9999, inside: false }
  var mouseSeenAt = 0
  var alertSuppressed = false
  var reduceMotion = false

  var blinkTimer = BLINK_MIN / 1000
  var blinkLeft = 0
  var lookTimer = LOOK_MIN / 1000
  var lookLeft = 0
  var idleLook = null
  var turnLeft = 0
  var hopLeft = 0
  var hopPlan = 0
  var hopDur = 0

  /* ── DOM ───────────────────────────────────────────────────────────── */
  function installStyles() {
    if (document.getElementById('dsh-pet-style')) return
    var style = document.createElement('style')
    style.id = 'dsh-pet-style'
    style.textContent = CSS
    ;(document.head || document.documentElement).appendChild(style)
  }

  function createDom() {
    root = document.createElement('div')
    root.id = 'dsh-pet-root'
    root.setAttribute('data-dsh-pet', '')

    actor = document.createElement('div')
    actor.className = 'dsh-pet-actor'
    actor.setAttribute('role', 'img')
    actor.setAttribute('aria-label', '桌宠：小红帽蕾克')

    zzz = document.createElement('span')
    zzz.className = 'dsh-pet-zzz'
    zzz.setAttribute('aria-hidden', 'true')
    zzz.textContent = 'Zzz'

    img = document.createElement('img')
    img.className = 'dsh-pet-img'
    img.alt = '小红帽蕾克'
    img.draggable = false
    img.title = '双击：休息 / 继续走动 · 右键：设置'
    img.src = FRAME_URL.front

    actor.appendChild(zzz)
    actor.appendChild(img)

    panel = document.createElement('div')
    panel.className = 'dsh-pet-panel'
    panel.hidden = true
    panel.innerHTML =
      '<div class="dsh-pet-panel-title"><span>小红帽蕾克</span>' +
      '<button type="button" class="dsh-pet-panel-close" aria-label="关闭">×</button></div>' +
      '<label class="dsh-pet-panel-row"><span>大小</span>' +
      '<input type="range" min="' + SCALE_MIN + '" max="' + SCALE_MAX + '" step="1" value="' + scale + '">' +
      '<span class="dsh-pet-panel-value">' + scale + '×</span></label>' +
      '<div class="dsh-pet-panel-hint">双击 休息 / 继续走动<br>右键 再次打开这个面板</div>'

    panelRange = panel.querySelector('input[type=range]')
    panelValue = panel.querySelector('.dsh-pet-panel-value')
    panelRange.addEventListener('input', function () {
      setScale(panelRange.value)
    })
    panel.querySelector('.dsh-pet-panel-close').addEventListener('click', function (event) {
      event.stopPropagation()
      closePanel()
    })
    panel.addEventListener('pointerdown', function (event) { event.stopPropagation() })

    root.appendChild(actor)
    root.appendChild(panel)
    document.body.appendChild(root)
  }

  /* ── 大小 ──────────────────────────────────────────────────────────── */
  function applySize() {
    spriteW = NATIVE_W * scale
    spriteH = NATIVE_H * scale
    if (actor) {
      actor.style.width = spriteW + 'px'
      actor.style.height = spriteH + 'px'
    }
    if (img) {
      img.style.width = spriteW + 'px'
      img.style.height = spriteH + 'px'
    }
    if (panelRange && Number(panelRange.value) !== scale) panelRange.value = String(scale)
    if (panelValue) panelValue.textContent = scale + '×'
    measure()
  }

  function setScale(value) {
    var next = Math.round(Number(value))
    if (!isFinite(next)) return
    next = clamp(next, SCALE_MIN, SCALE_MAX)
    if (next === scale) return
    scale = next
    writeScale(scale)
    applySize()
    if (panelOpen) positionPanel()
    render()
  }

  /* ── 量会话窗口 ────────────────────────────────────────────────────── */
  function pickConversation() {
    var nodes = document.querySelectorAll('[data-conversation-content]')
    var best = null
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i]
      var rect = el.getBoundingClientRect()
      if (rect.width < 220 || rect.height < 140) continue
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue
      if (!best || rect.width > best.rect.width) best = { el: el, rect: rect }
    }
    return best
  }

  /** 小鲸鱼挂件暴露的根节点（不存在就返回 null，不产生依赖）。 */
  function whaleFootprint() {
    try {
      var node = window.__dshWhaleRoot
      if (!node || typeof node.getBoundingClientRect !== 'function') return null
      var rect = node.getBoundingClientRect()
      if (rect.width < 24 || rect.height < 24) return null
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) return null
      return rect
    } catch (err) {
      return null
    }
  }

  function measure() {
    var conv = pickConversation()
    var left, right, target
    if (conv) {
      var box = conv.rect
      left = box.left + EDGE_PAD
      right = box.right - EDGE_PAD
      var seat = conv.el.querySelector('[data-composer-seat]')
      var seatRect = seat ? seat.getBoundingClientRect() : null
      if (seatRect && seatRect.width > 0 && seatRect.top > box.top) {
        // 站在输入区上沿：只压住一点渐变，不会盖住输入框本体。
        target = seatRect.top - 1
      } else {
        target = box.bottom - 6
      }
      target = clamp(target, box.top + spriteH + 4, box.bottom - 4)
    } else {
      // 没有会话窗口（例如设置页）：退化成窗口底部，仍然不越界。
      var main = document.querySelector('main')
      var m = main ? main.getBoundingClientRect() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
      left = m.left + 16
      right = m.right - 16
      target = m.bottom - 10
    }

    if (!isFinite(left) || !isFinite(right) || right - left < 40) {
      left = 16
      right = Math.max(56, window.innerWidth - 16)
    }

    var half = spriteW / 2

    // 避让右下角的小鲸鱼挂件（装了才有）：把它的矩形从散步范围里让出来。
    var whale = whaleFootprint()
    if (whale) {
      var petTop = target - spriteH
      var vOverlap = target > whale.top + 8 && petTop < whale.bottom - 8
      if (vOverlap) {
        var mid = (left + right) / 2
        var gap = 12
        var nextLeft = left
        var nextRight = right
        if (whale.left > mid) nextRight = Math.min(nextRight, whale.left - gap)
        else if (whale.right < mid) nextLeft = Math.max(nextLeft, whale.right + gap)
        else if (whale.left - left > right - whale.right) nextRight = Math.min(nextRight, whale.left - gap)
        else nextLeft = Math.max(nextLeft, whale.right + gap)
        if (nextRight - nextLeft >= spriteW + 24) {
          left = nextLeft
          right = nextRight
        }
      }
    }

    minX = left + half
    maxX = right - half
    if (maxX < minX) maxX = minX
    x = clamp(x, minX, maxX)

    targetFloor = target
    if (!floor) floor = target
  }

  /* ── 姿势 ──────────────────────────────────────────────────────────── */
  var frameOk = {}   // 某个帧没挂上（例如插件升级后还没重启宿主）就优雅回退，不破图

  function fallbackPose(name) {
    if (frameOk[name] === false) {
      if (name === 'frontBlink') return 'front'
      if (name === 'leftBlink') return 'left'
      if (name === 'rightBlink') return 'right'
      if (name === 'sleep') return 'front'
      if (name === 'back') return 'front'
    }
    return name
  }

  function setPose(next) {
    if (!FRAME_URL[next]) next = 'front'
    next = fallbackPose(next)
    if (next === pose) return
    pose = next
    if (!img) return
    var url = FRAME_URL[next]
    if (img.getAttribute('src') === url) return
    img.src = url
  }

  function basePose() {
    if (turnLeft > 0) return 'back'
    if (state === 'rest') return 'sleep'
    if (panelOpen) return 'front'
    if (state === 'alert') {
      if (!mouse.inside) return 'front'
      var dx = mouse.x - x
      if (dx < -16) return 'left'
      if (dx > 16) return 'right'
      return 'front'
    }
    if (state === 'walk') return dir < 0 ? 'left' : 'right'
    if (state === 'idle' && idleLook) return idleLook
    return 'front'
  }

  function resolvePose() {
    var p = basePose()
    if (blinkLeft > 0) {
      if (p === 'front') return 'frontBlink'
      if (p === 'left') return 'leftBlink'
      if (p === 'right') return 'rightBlink'
    }
    return p
  }

  /* ── 状态切换 ──────────────────────────────────────────────────────── */
  function enterIdle() {
    state = 'idle'
    stateTimer = rand(IDLE_MIN, IDLE_MAX) / 1000
    pendingDir = dir
    idleLook = null
    lookTimer = rand(LOOK_MIN, LOOK_MAX) / 1000
    hopPlan = Math.random() < HOP_CHANCE ? rand(0.25, 0.9) : 0
    setPose(resolvePose())
  }

  function startWalking(nextDir) {
    if (typeof nextDir === 'number') dir = nextDir >= 0 ? 1 : -1
    state = 'walk'
    burstTimer = rand(WALK_BURST_MIN, WALK_BURST_MAX) / 1000
    idleLook = null
    setPose(resolvePose())
  }

  function enterAlert() {
    if (state === 'alert' || resting || panelOpen) return
    state = 'alert'
    blinkTimer = Math.max(blinkTimer, 0.6)
  }

  function leaveAlert() {
    if (state !== 'alert') return
    startWalking()
  }

  function setRest(value) {
    var next = value === undefined ? !resting : !!value
    if (next === resting) return
    resting = next
    if (actor) actor.classList.toggle('is-rest', resting)
    if (resting) {
      state = 'rest'
      turnLeft = 0
      hopLeft = 0
      setPose(resolvePose())
    } else {
      startWalking()
    }
  }

  function toggleRest() {
    setRest(!resting)
  }

  /* ── 设置面板 ──────────────────────────────────────────────────────── */
  function positionPanel() {
    if (!panel || panel.hidden) return
    var w = panel.offsetWidth || 196
    var h = panel.offsetHeight || 96
    var left = clamp(Math.round(x - w / 2), 8, Math.max(8, window.innerWidth - w - 8))
    var top = Math.round(floor - spriteH - h - 10)
    if (top < 8) top = Math.round(floor + 8)
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8)
    panel.style.left = left + 'px'
    panel.style.top = top + 'px'
  }

  function openPanel() {
    if (!panel) return
    panelOpen = true
    panel.hidden = false
    positionPanel()
  }

  function closePanel() {
    if (!panel) return
    if (!panelOpen) return
    panelOpen = false
    panel.hidden = true
    if (!resting) startWalking()
  }

  /* ── 每帧 ──────────────────────────────────────────────────────────── */
  function distanceToHead() {
    if (!mouse.inside) return Infinity
    var headX = x
    var headY = floor - spriteH * FOLLOW_HEAD_Y
    var dx = mouse.x - headX
    var dy = mouse.y - headY
    return Math.sqrt(dx * dx + dy * dy)
  }

  function hopOffset() {
    if (hopDur <= 0) return 0
    var p = 1 - hopLeft / hopDur
    return Math.round(Math.sin(p * Math.PI) * spriteH * 0.075)
  }

  function bobOffset(now) {
    if (hopLeft > 0) return -hopOffset()
    if (reduceMotion) return 0
    var unit = Math.max(1, Math.round(scale / 4))
    if (state === 'walk') {
      // 两步一拍的上下起伏，整数像素，不糊边。
      return ((Math.floor(walkClock / 0.16) % 2) ? -1 : 0) * unit
    }
    if (state === 'rest') {
      // 睡觉时轻轻呼吸
      return Math.sin(now * 1.4) > 0 ? -unit : 0
    }
    return 0
  }

  function update(dt, now) {
    if (!ready) return

    measureClock += dt
    if (measureClock >= MEASURE_EVERY / 1000) {
      measureClock = 0
      measure()
      if (panelOpen) positionPanel()
    }

    // 地面高度平滑跟随（切换会话/输入框变高时不会瞬移）
    var k = Math.min(1, dt * FLOOR_LERP)
    floor += (targetFloor - floor) * k

    // 眨眼 / 张望 / 掉头 / 蹦跳的计时
    if (blinkLeft > 0) blinkLeft = Math.max(0, blinkLeft - dt)
    if (state !== 'rest') {
      blinkTimer -= dt
      if (blinkTimer <= 0) {
        blinkLeft = BLINK_MS / 1000
        blinkTimer = rand(BLINK_MIN, BLINK_MAX) / 1000
      }
    }
    if (turnLeft > 0) turnLeft = Math.max(0, turnLeft - dt)
    if (hopLeft > 0) hopLeft = Math.max(0, hopLeft - dt)

    if (resting) {
      setPose(resolvePose())
      return
    }

    if (panelOpen) {
      setPose('front')
      return
    }

    var dist = distanceToHead()
    if (alertSuppressed && dist > ALERT_LEAVE_RADIUS) alertSuppressed = false
    if (!alertSuppressed && state !== 'alert' && dist < ALERT_RADIUS) {
      enterAlert()
    } else if (state === 'alert' && dist > ALERT_LEAVE_RADIUS) {
      leaveAlert()
    } else if (state === 'alert' && mouseSeenAt > 0 && (performance.now() - mouseSeenAt) > ALERT_HOLD_MS) {
      // 鼠标停在原地不动了：看够了，接着散步；鼠标挪开之前不再反复转头。
      alertSuppressed = true
      leaveAlert()
    }

    if (state === 'alert') {
      setPose(resolvePose())
      return
    }

    if (state === 'idle') {
      stateTimer -= dt
      if (hopPlan > 0) {
        hopPlan -= dt
        if (hopPlan <= 0 && hopLeft <= 0) {
          hopDur = HOP_MS / 1000
          hopLeft = hopDur
        }
      }
      if (lookLeft > 0) {
        lookLeft -= dt
        if (lookLeft <= 0) {
          idleLook = null
          lookTimer = rand(LOOK_MIN, LOOK_MAX) / 1000
        }
      } else if (!idleLook && hopLeft <= 0) {
        lookTimer -= dt
        if (lookTimer <= 0) {
          idleLook = Math.random() < 0.5 ? 'left' : 'right'
          lookLeft = rand(LOOK_MS_MIN, LOOK_MS_MAX) / 1000
        }
      }
      if (stateTimer <= 0) {
        startWalking(pendingDir)
        return
      }
      setPose(resolvePose())
      return
    }

    // walk
    walkClock += dt
    x += dir * SPEED * dt
    if (x <= minX) {
      x = minX
      dir = 1
      turnLeft = TURN_MS / 1000
      enterIdle()
    } else if (x >= maxX) {
      x = maxX
      dir = -1
      turnLeft = TURN_MS / 1000
      enterIdle()
    } else {
      burstTimer -= dt
      if (burstTimer <= 0) {
        enterIdle()
        return
      }
      setPose(resolvePose())
    }
  }

  function render() {
    if (!actor) return
    var now = performance.now() / 1000
    var bob = bobOffset(now)
    var left = Math.round(x - spriteW / 2)
    var top = Math.round(floor - spriteH + bob)
    actor.style.transform = 'translate3d(' + left + 'px,' + top + 'px,0)'
  }

  function tick(ts) {
    if (destroyed) return
    if (!lastTs) lastTs = ts
    var dt = Math.min(0.05, (ts - lastTs) / 1000)
    lastTs = ts
    update(dt, ts / 1000)
    render()
    rafId = window.requestAnimationFrame(tick)
  }

  /* ── 事件 ──────────────────────────────────────────────────────────── */
  function onPointerMove(event) {
    if (!event) return
    if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return
    if (event.pointerType === 'touch') return
    mouse.x = event.clientX
    mouse.y = event.clientY
    mouseSeenAt = performance.now()
    mouse.inside =
      mouse.x >= 0 && mouse.y >= 0 &&
      mouse.x <= window.innerWidth && mouse.y <= window.innerHeight
  }

  function onPointerOut(event) {
    if (event && event.relatedTarget) return
    mouse.inside = false
  }

  function onOutsideDown(event) {
    if (!panelOpen || !panel) return
    if (event.target === img) return          // 点/右键桌宠本身：让 contextmenu 处理开关
    if (panel.contains(event.target)) return
    closePanel()
  }

  function onKeyDown(event) {
    if (panelOpen && event.key === 'Escape') closePanel()
  }

  var bound = false
  function bind() {
    if (bound) return
    bound = true
    window.addEventListener('pointermove', onPointerMove, { passive: true, capture: true })
    window.addEventListener('mousemove', onPointerMove, { passive: true, capture: true })
    window.addEventListener('pointerleave', onPointerOut, true)
    document.addEventListener('pointerleave', onPointerOut, true)
    window.addEventListener('resize', function () {
      measure()
      if (panelOpen) positionPanel()
    }, { passive: true })
    window.addEventListener('scroll', measure, { passive: true, capture: true })
    window.addEventListener('pointerdown', onOutsideDown, true)
    window.addEventListener('keydown', onKeyDown, true)

    if (img) {
      img.addEventListener('dblclick', function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (panelOpen) closePanel()
        toggleRest()
      })
      img.addEventListener('click', function (event) {
        // 单击只吞掉事件，避免点桌宠时触发底下的界面；双击负责休息。
        event.stopPropagation()
      })
      img.addEventListener('contextmenu', function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (panelOpen) closePanel()
        else openPanel()
      })
      img.addEventListener('dragstart', function (event) { event.preventDefault() })
    }
  }

  /* ── 启动 ──────────────────────────────────────────────────────────── */
  function preload(list, onDone) {
    var left = list.length
    if (!left) { onDone(); return }
    var finished = false
    function settle(name, ok) {
      frameOk[name] = ok
      left -= 1
      if (left === 0 && !finished) {
        finished = true
        onDone()
      }
    }
    for (var i = 0; i < list.length; i++) {
      (function (item) {
        var image = new Image()
        image.onload = function () { settle(item.name, true) }
        image.onerror = function () { settle(item.name, false) }
        image.src = item.url
      })(list[i])
    }
  }

  function boot() {
    if (destroyed) return
    if (!document.body) { setTimeout(boot, 30); return }
    if (document.getElementById('dsh-pet-root')) return

    reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    installStyles()
    createDom()
    applySize()

    preload([
      { name: 'front', url: FRAME_URL.front },
      { name: 'left', url: FRAME_URL.left },
      { name: 'right', url: FRAME_URL.right },
      { name: 'back', url: FRAME_URL.back },
      { name: 'frontBlink', url: FRAME_URL.frontBlink },
      { name: 'leftBlink', url: FRAME_URL.leftBlink },
      { name: 'rightBlink', url: FRAME_URL.rightBlink },
      { name: 'sleep', url: FRAME_URL.sleep }
    ], function () {
      if (destroyed) return
      var probe = new Image()
      probe.onerror = function () {
        // 资源没挂上（路由缺失/被拦）：安静收场，不留半只桌宠在页面上。
        if (root && root.parentNode) root.parentNode.removeChild(root)
      }
      probe.onload = function () {
        if (destroyed) return
        applySize()
        measure()
        x = (minX + maxX) / 2
        floor = targetFloor
        startWalking(1)
        bind()
        ready = true
        actor.classList.add('is-ready')
        rafId = window.requestAnimationFrame(tick)
        document.dispatchEvent(new CustomEvent('dsh-pet-ready'))
        if (typeof window.__DSH_PET_ONREADY__ === 'function') {
          try { window.__DSH_PET_ONREADY__(window.__DSH_PET__) } catch (err) { /* noop */ }
        }
      }
      probe.src = FRAME_URL.front
    })
  }

  function destroy() {
    destroyed = true
    if (rafId) window.cancelAnimationFrame(rafId)
    rafId = 0
    if (root && root.parentNode) root.parentNode.removeChild(root)
    root = actor = img = zzz = panel = panelRange = panelValue = null
    window.__DSH_PET_BOOTED__ = false
  }

  /* ── 对外调试/扩展接口 ─────────────────────────────────────────────── */
  window.__DSH_PET__ = {
    get state() { return state },
    get pose() { return pose },
    get resting() { return resting },
    get scale() { return scale },
    get panelOpen() { return panelOpen },
    get position() {
      return { x: x, floor: floor, minX: minX, maxX: maxX, w: spriteW, h: spriteH }
    },
    rest: function (value) { setRest(value) },
    setScale: function (value) { setScale(value) },
    openPanel: function () { openPanel() },
    closePanel: function () { closePanel() },
    face: function (px, py) {
      mouse.x = px
      mouse.y = py
      mouse.inside = true
    },
    leave: function () { mouse.inside = false },
    measure: measure,
    // 手动推进一帧（仅供预览页/自动化测试在没有 rAF 的环境里驱动状态机）
    step: function (ms) {
      var dt = Math.max(0, Math.min(0.05, (typeof ms === 'number' ? ms : 16) / 1000))
      update(dt, performance.now() / 1000 + dt)
      render()
      return { state: state, pose: pose, x: x, resting: resting, scale: scale }
    },
    destroy: destroy
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true })
    setTimeout(boot, 1200) // 兜底：DOMContentLoaded 已被错过的极端情况
  } else {
    boot()
  }
})()
