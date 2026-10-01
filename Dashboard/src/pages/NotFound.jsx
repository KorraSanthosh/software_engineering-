import { Link } from 'react-router-dom'
import { Empty } from '../components/ui'

export default function NotFound() {
  return (
    <div className="panel">
      <Empty title="Page not in this edition" action={<Link className="btn primary" to="/">Back to the front page</Link>}>
        The page you’re looking for doesn’t exist.
      </Empty>
    </div>
  )
}
