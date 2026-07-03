export default function TBMMetric({ label, value, accent = false }) {
  return (
    <div
      style={{
        background: "#020617",
        border: "1px solid #253248",
        borderRadius: 12,
        padding: "8px 9px",
        minWidth: 0,
      }}
    >
      <span
        style={{
          display: "block",
          color: "#9ca3af",
          fontSize: 10,
          fontWeight: 900,
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </span>
      <strong
        style={{
          color: accent ? "#22c55e" : "#f9fafb",
          fontSize: 15,
          display: "block",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value ?? "N/A"}
      </strong>
    </div>
  );
}
