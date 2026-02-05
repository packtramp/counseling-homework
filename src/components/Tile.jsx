export default function Tile({ title, action, children, className = '' }) {
  return (
    <div className={`tile ${className}`}>
      {(title || action) && (
        <div className="tile-header">
          {title && <h3 className="tile-title">{title}</h3>}
          {action && <div className="tile-action">{action}</div>}
        </div>
      )}
      <div className="tile-content">
        {children}
      </div>
    </div>
  );
}
