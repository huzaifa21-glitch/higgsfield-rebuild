type PlaceholderProps = {
  title: string
  description: string
}

function Placeholder({ title, description }: PlaceholderProps) {
  return (
    <section className="placeholder">
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  )
}

export default Placeholder
