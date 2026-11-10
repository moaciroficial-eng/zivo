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

  /* Barras por dia (sem venda = sem barra — a curva suavizada antes dava a
     impressão de vendas acontecendo entre dias que ficaram zerados). */
  const slotW = chartW / daysInMonth
  const barW = Math.max(2, slotW * 0.6)

  // Y axis labels
  const yLabels = [0, 0.5, 1].map(pct => ({
    val: maxVal * pct,
    y: yPos(maxVal * pct),
  }))

  // X axis ticks (every 5 days)
  const xTicks = days.filter(d => d.day === 1 || d.day % 7 === 0 || d.day === daysInMonth)

  const gradId = 'salesGrad'

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
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E0B36A" />
              <stop offset="100%" stopColor="#A67C3D" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {yLabels.map(({ y }, i) => (
            <line key={i} x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
              stroke="#27272a" strokeWidth="1" strokeDasharray={i === 0 ? '0' : '4 4'} />
          ))}

          {/* Barras — uma por dia, zero quando não houve venda (sem a curva
              suavizada de antes, que dava impressão de venda em dia vazio) */}
          {days.map(d => {
            if (d.valor <= 0) return null
            const y = yPos(d.valor)
            const isToday = d.day === today
            return (
              <rect
                key={d.day}
                x={xPos(d.day) - barW / 2}
                y={y}
                width={barW}
                height={Math.max(0, PAD.top + chartH - y)}
                rx={Math.min(2, barW / 2)}
                fill={isToday ? '#C79A54' : `url(#${gradId})`}
                opacity={isToday ? 1 : 0.85}
              />
            )
          })}

          {/* Y axis labels */}
          {yLabels.map(({ val, y }, i) => (
            <text key={i} x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#52525b">
              {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)}
            </text>
          ))}

          {/* X axis labels */}
          {xTicks.map(({ day }) => (
            <text key={day} x={xPos(day)} y={H - 6} textAnchor="middle" fontSize="9"
              fill={day === today ? '#E0B36A' : '#52525b'} fontWeight={day === today ? '600' : '400'}>
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
              <circle cx={tooltip.x} cy={tooltip.y} r="4" fill="#C79A54" stroke="#09090b" strokeWidth="2" />
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
