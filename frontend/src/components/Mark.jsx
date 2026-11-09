/**
 * The Sky mark: a stepped, loaded bar, the same shape as the app icon. Decorative wherever it
 * appears, since the product name always sits beside it in text.
 * @param {number} [size] - Rendered height in pixels; the width follows the mark's proportions.
 */
export default function Mark({ size = 20, className = '' }) {
  return (
    <svg className={'mark ' + className} viewBox="80 168 352 176" height={size} width={size * 2} aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M80 200h36v42h15v-74h47v74h156v-74h47v74h15v-42h36v112h-36v-42h-15v73h-47v-73H178v73h-47v-73h-15v42H80Z" />
    </svg>
  )
}
