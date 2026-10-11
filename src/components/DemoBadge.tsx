const TIPS = {
  video:
    'Video generation is simulated in this build: this is a pre-made sample clip, not made from your image. ' +
    'A real video model can replace the mock provider without changing anything else.',
  image:
    "Today's free AI capacity ran out, so this is a sample image, not made from your prompt or photo. " +
    'Your credits were refunded.',
}

// Marks output that wasn't really generated. Focusable so the tooltip also works from the keyboard.
function DemoBadge({ kind = 'video' }: { kind?: 'video' | 'image' }) {
  const tip = TIPS[kind]
  return (
    <span className="badge demo-badge" tabIndex={0} aria-label={`Demo output. ${tip}`} data-tip={tip}>
      Demo output
    </span>
  )
}

export default DemoBadge
