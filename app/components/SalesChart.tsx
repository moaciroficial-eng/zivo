'use client'

import { useState } from 'react'

type DayData = { day: number; valor: number }

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export default function SalesChart({ data, mes }: { data: DayData[]; mes: string }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; day: number; valor: number } | null>(null)

  if (!data.length || data.every(d => d.valor === 0)) return null

  const W = 600
  const H = 160
  const PAD = { top: 16, right: 16, bottom: 28, left: 48 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const [year, month] = mes.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  const today = new Date().getDate()

  // Build full month array (fill missing days with 0)
  const byDay: Record<number, number> = {}
  data.forEach(d => { byDay[d.day] = d.valor })
  const days = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    valor: byDay[i + 1] ?? 0,
  }))

  const maxVal = Math.max(...days.map(d => d.valor), 1)

  function xPos(day: number) {
    return PAD.left + ((day - 1) / Math.max(daysInMonth - 1, 1)) * chartW
  }
  function yPos(val: number) {
    return PAD.top + chartH - (val / maxVal) * chartH
  }

  // Smooth bezier path
  const points = days.map(d => ({ x: xPos(d.day), y: yPos(d.valor) }))
  function smoothPath(pts: { x: number; y: number }[]) {
    if (pts.length < 2) return ''
    let d = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]
      const curr = pts[i]
      const cpx = (prev.x + curr.x) / 2
      d += ` C ${cpx} ${prev.y} ${cpx} ${curr.y} ${curr.x} ${curr.y}`
    }
    return d
  }

  const linePath = smoothPath(points)
  const fillPath = `${linePath} L ${points[points.length - 1].x} ${PAD.top + chartH} L ${points[0].x} ${PAD.top + chartH} Z`

  // Y axis labels
  const yLabels = [0, 0.5, 1].map(pct => ({
    val: maxVal * pct,
    y: yPos(maxVal * pct),
  }))

  // X axis ticks (every 5 days)
  const xTicks = days.filter(d => d.day === 1 || d.day % 7 === 0 || d.day === daysInMonth)

  const gradId = 'salesGrad'
  const gradFillId = 'salesFill'

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Vendas do mês</p>
      <div className="relative" style={{ paddingBottom: '28%' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0 w-full h-full overflow-visible"
          onMouseLeave={() => setTooltip(null)}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
            <linearGradient id={gradFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {yLabels.map(({ y }, i) => (
            <line key={i} x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
              stroke="#27272a" strokeWidth="1" strokeDasharray={i === 0 ? '0' : '4 4'} />
          ))}

          {/* Fill */}
          <path d={fillPath} fill={`url(#${gradFillId})`} />

          {/* Line */}
          <path d={linePath} fill="none" stroke={`url(#${gradId})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Today marker */}
          {byDay[today] !== undefined && (
            <circle cx={xPos(today)} cy={yPos(byDay[today] ?? 0)} r="4" fill="#8b5cf6" stroke="#09090b" strokeWidth="2" />
          )}

          {/* Y axis labels */}
          {yLabels.map(({ val, y }, i) => (
            <text key={i} x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#52525b">
              {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)}
            </text>
          ))}

          {/* X axis labels */}
          {xTicks.map(({ day }) => (
            <text key={day} x={xPos(day)} y={H - 6} textAnchor="middle" fontSize="9"
              fill={day === today ? '#a78bfa' : '#52525b'} fontWeight={day === today ? '600' : '400'}>
              {day}
            </text>
          ))}

          {/* Invisible hover zones */}
          {days.map(d => (
            <rect
              key={d.day}
              x={xPos(d.day) - chartW / daysInMonth / 2}
              y={PAD.top}
              width={chartW / daysInMonth}
              height={chartH}
              fill="transparent"
              onMouseEnter={() => setTooltip({ x: xPos(d.day), y: yPos(d.valor), day: d.day, valor: d.valor })}
            />
          ))}

          {/* Tooltip */}
          {tooltip && tooltip.valor > 0 && (
            <g>
              <line x1={tooltip.x} x2={tooltip.x} y1={PAD.top} y2={PAD.top + chartH}
                stroke="#3f3f46" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={tooltip.x} cy={tooltip.y} r="4" fill="#8b5cf6" stroke="#09090b" strokeWidth="2" />
              <rect x={Math.min(tooltip.x - 44, W - PAD.right - 88)} y={tooltip.y - 30}
                width="88" height="22" rx="4" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
              <text x={Math.min(tooltip.x - 44, W - PAD.right - 88) + 44} y={tooltip.y - 15}
                textAnchor="middle" fontSize="10" fill="#e4e4e7" fontWeight="600">
                Dia {tooltip.day} · {formatBRL(tooltip.valor)}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}
