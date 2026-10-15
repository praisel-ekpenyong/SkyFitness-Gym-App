import { useUI } from '../store/useUI.js'
/**
 * Transient bottom message from the UI store; renders an empty hidden container when there is no message.
 */
export default function Toast() {
  const msg = useUI(s => s.toastMsg)
  return <div id="toast" className={msg ? 'show' : ''}>{msg}</div>
}
