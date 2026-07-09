import TBMTopPlayRow from "../home/TBMTopPlayRow";
import TBMLockedCard from "./TBMLockedCard";
import "./TBMPremiumCardStack.css";

export default function TBMPremiumCardStack({
  title = "Today's Premium Card",
  plays = [],
  visibleCount = 1,
  lockedCount = 2,
}) {
  const visiblePlays = Array.isArray(plays) ? plays.slice(0, visibleCount) : [];
  const locks = Array.from({ length: lockedCount });

  return (
    <section className="tbm-premium-stack">
      <div className="tbm-premium-stack-head">
        <div>
          <span>Premium Preview</span>
          <h2>{title}</h2>
        </div>
        <strong>Members Only</strong>
      </div>

      <div className="tbm-premium-stack-list">
        {visiblePlays.length > 0 ? (
          visiblePlays.map((play, index) => (
            <TBMTopPlayRow
              key={`${play?.game}-${play?.pick}-${index}`}
              play={play}
              index={index}
            />
          ))
        ) : (
          <TBMLockedCard title="Premium Card Loading" subtitle="No public play available yet" />
        )}

        {locks.map((_, index) => (
          <TBMLockedCard key={`locked-${index}`} />
        ))}
      </div>
    </section>
  );
}
