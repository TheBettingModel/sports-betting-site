export default function TBMCard({ children, featured = false, className = "" }) {
  return (
    <div
      className={`tbm-card tbm-card-pad tbm-card-hover ${
        featured ? "tbm-card-featured" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
