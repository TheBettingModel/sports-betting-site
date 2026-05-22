function SharpMarketPage() {
  return (
    <div
      style={{
        padding: "30px",
        backgroundColor: "#0b0b0b",
        minHeight: "100vh",
        color: "white",
      }}
    >
      <h1 style={{ fontSize: "38px", marginBottom: "10px" }}>
        Sharp Market
      </h1>

      <p style={{ color: "#9ca3af", maxWidth: "850px", lineHeight: "1.6" }}>
        Sharp Market will track betting market movement, model signals,
        steam alerts, price shifts, and closing-line value indicators.
      </p>

      <div
        style={{
          marginTop: "30px",
          backgroundColor: "#111827",
          border: "1px solid #374151",
          borderRadius: "16px",
          padding: "24px",
        }}
      >
        <h2>Coming Soon</h2>

        <p style={{ color: "#d1d5db", lineHeight: "1.6" }}>
          This page will eventually show:
        </p>

        <ul style={{ color: "#d1d5db", lineHeight: "1.8" }}>
          <li>Steam move detection</li>
          <li>Opening line vs current line</li>
          <li>Model lean compared to market movement</li>
          <li>Best available sportsbook price</li>
          <li>CLV tracking signals</li>
          <li>Sharp action alerts</li>
        </ul>
      </div>
    </div>
  );
}

export default SharpMarketPage;

