const TIP =
  'Video generation is simulated in this build: this is a pre-made sample clip, not made from your image. ' +
  'A real video model can replace the mock provider without changing anything else.'

// Marks output from the mock video provider. Focusable so the tooltip also works from the keyboard.
function DemoBadge() {
  return (
    <span className="badge demo-badge" tabIndex={0} aria-label={`Demo output. ${TIP}`} data-tip={TIP}>
      Demo output
    </span>
  )
}

export default DemoBadge
