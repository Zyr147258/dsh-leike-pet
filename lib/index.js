/**
 * dsh-leike-pet — Host 半侧
 * ---------------------------------------------------------------------------
 * 只在会话窗口里挂一只「小红帽蕾克」桌宠。本文件负责两件事：
 *   1) 把 /dsh-pet/* 静态资源（精灵图 + 前端脚本）挂到宿主 HTTP 载体上；
 *   2) 向 index.html 注入一行引导脚本，让浏览器加载 /dsh-pet/pet.js。
 *
 * 注入为什么不用 `webServer.tapIndex` 就够了：
 *   - 官方桌面端（Electron）的 index.html 由安装包静态 dist 直出，永远不经过
 *     宿主的 renderIndex()，所以 tapIndex 在桌面端不生效；
 *   - 桌面端唯一通道是 `webserver/index-inject` 的结构化行（宿主启动时收集一次，
 *     经 IPC 交给渲染层逐行应用）。因此注入行必须在 apply() 的第一时间登记，
 *     不能等到 webServer 就绪 —— 收集只发生一次，晚一步就永远进不了表。
 *   - 行内容用「内联 script」而不是 `script-src`：桌面端渲染层对 `script-src`
 *     是加载失败即 reject 整轮 boot，而内联行自己建 script 且吞掉 onerror，
 *     路由不在时静默失败，绝不会拖垮宿主启动。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NS = 'dsh-leike-pet'
const ROUTE = '/dsh-pet'

/** 允许外露的静态资源（白名单，杜绝目录穿越）。 */
const FILES = new Map([
  ['pet.js', { file: 'lib/pet.js', type: 'application/javascript; charset=utf-8' }],
  ['frame-front.png', { file: 'assets/frame-front.png', type: 'image/png' }],
  ['frame-left.png', { file: 'assets/frame-left.png', type: 'image/png' }],
  ['frame-right.png', { file: 'assets/frame-right.png', type: 'image/png' }],
  ['frame-back.png', { file: 'assets/frame-back.png', type: 'image/png' }],
  ['frame-front-blink.png', { file: 'assets/frame-front-blink.png', type: 'image/png' }],
  ['frame-left-blink.png', { file: 'assets/frame-left-blink.png', type: 'image/png' }],
  ['frame-right-blink.png', { file: 'assets/frame-right-blink.png', type: 'image/png' }],
  ['frame-front-sleep.png', { file: 'assets/frame-front-sleep.png', type: 'image/png' }],
  ['icon.png', { file: 'icon.png', type: 'image/png' }]
])

/**
 * 引导脚本：自己建 `<script src="/dsh-pet/pet.js">` 并吞掉 onerror。
 * 这样无论走 tapIndex（Web）还是结构化注入行（桌面端）都能生效；
 * 两处都注入时会因 id 已存在而不重复创建。
 */
const BOOT_SCRIPT =
  '(function(){' +
  'try{' +
  'if(document.getElementById("dsh-pet-js"))return;' +
  'var d=document.body||document.head||document.documentElement;' +
  'if(!d)return;' +
  'var s=document.createElement("script");' +
  's.id="dsh-pet-js";' +
  's.src="' + ROUTE + '/pet.js";' +
  's.async=true;' +
  's.onerror=function(){};' +
  'd.appendChild(s)' +
  '}catch(e){}' +
  '})()'

/** 读文件（按 mtime 缓存，改完刷新页面即生效）。 */
function makeReader(rel) {
  let cache = null
  return function read() {
    const file = path.join(PACKAGE_ROOT, rel)
    try {
      const st = fs.statSync(file)
      if (!cache || cache.mtimeMs !== st.mtimeMs) {
        cache = { mtimeMs: st.mtimeMs, data: fs.readFileSync(file) }
      }
      return cache.data
    } catch (err) {
      return null
    }
  }
}

function apply(ctx) {
  // ① 注入行先登记：桌面端只收集一次，晚于收集就再也进不了表。
  ctx.on('webserver/index-inject', (table) => {
    try {
      if (!Array.isArray(table)) return
      for (const row of table) {
        if (!row) continue
        if (row.kind === 'script-src' && typeof row.src === 'string' && row.src.includes(ROUTE + '/pet.js')) return
        if (row.kind === 'script' && typeof row.text === 'string' && row.text.includes(ROUTE + '/pet.js')) return
      }
      table.push({ kind: 'script', placement: 'body', text: BOOT_SCRIPT })
    } catch (err) { /* 注入失败只影响桌宠，不影响宿主 */ }
  })

  // ② 静态资源路由：等 webServer 就绪后再挂。
  ctx.inject(['webServer'], (webCtx) => {
    const server = webCtx.webServer || (typeof webCtx.get === 'function' ? webCtx.get('webServer') : undefined)
    if (!server || typeof server.register !== 'function') {
      try {
        ctx.logger?.warn?.('[' + NS + '] 当前 profile 没有可用的 webServer，桌宠资源路由未注册。')
      } catch (err) { /* noop */ }
      return
    }

    const disposers = []
    for (const [name, meta] of FILES) {
      const read = makeReader(meta.file)
      disposers.push(server.register({
        kind: 'exact',
        path: ROUTE + '/' + name,
        handler: (req, res) => {
          const data = read()
          if (data === null) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('not found')
            return
          }
          res.writeHead(200, {
            'Content-Type': meta.type,
            'Cache-Control': 'no-store',
            'Content-Length': String(data.length)
          })
          res.end(data)
        }
      }))
    }

    // ③ Web 形态（dsh web）走 tapIndex；桌面端不经过这里，由 ① 负责。
    if (typeof server.tapIndex === 'function') {
      disposers.push(server.tapIndex((html) => {
        if (typeof html !== 'string' || html.includes(ROUTE + '/pet.js')) return html
        const tag = '<script defer id="dsh-pet-js" src="' + ROUTE + '/pet.js"></script>'
        return html.includes('</body>') ? html.replace('</body>', tag + '</body>') : html + tag
      }))
    }

    webCtx.effect(() => () => {
      for (const dispose of disposers) {
        try { dispose() } catch (err) { /* noop */ }
      }
    })
  })
}

export default {
  name: NS,
  apply
}
