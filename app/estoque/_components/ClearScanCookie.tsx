'use client'

import { useEffect } from 'react'
import { clearScanCookie } from '../actions'

export default function ClearScanCookie() {
  useEffect(() => {
    clearScanCookie()
  }, [])
  return null
}
