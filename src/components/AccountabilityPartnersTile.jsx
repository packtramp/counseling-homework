/**
 * Accountability Partners Tile - shows count, opens management modal
 */
export default function AccountabilityPartnersTile({
  myPartners = [],
  watchingMe = [],
  onClick
}) {
  return (
    <div className="accountability-partners-tile" onClick={onClick}>
      <span className="ap-tile-title">Accountability Partners</span>
      <span className="ap-tile-count">{myPartners.length}</span>
    </div>
  );
}
