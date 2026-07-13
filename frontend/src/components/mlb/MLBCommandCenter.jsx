import { useMemo } from "react";
import "./MLBCommandCenter.css";

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function numericValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPercent(value, digits = 2) {
  const parsed = numericValue(value);

  if (parsed === null) {
    return "0.00%";
  }

  return `${parsed.toFixed(digits)}%`;
}

function formatBook(value) {
  const book = String(value || "").trim();
  return book || "Best Available";
}

function getGameKey(play, index) {
  const game =
    play?.game ||
    play?.matchup ||
    play?.event ||
    play?.event_name ||
    play?.name;

  if (game) {
    return normalize(game);
  }

  const away =
    play?.away_team ||
    play?.away ||
    play?.visitor_team ||
    play?.visitor;

  const home =
    play?.home_team ||
    play?.home ||
    play?.host_team ||
    play?.host;

  if (away || home) {
    return `${normalize(away)}-${normalize(home)}`;
  }

  return `play-${index}`;
}

function getOdds(play) {
  const candidates = [
    play?.best_odds,
    play?.odds,
    play?.american_odds,
    play?.price,
    play?.line_odds,
  ];

  for (const candidate of candidates) {
    const parsed = numericValue(candidate);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function getPickText(play) {
  return normalize(
    play?.pick ||
      play?.recommendation ||
      play?.selection ||
      play?.bet ||
      ""
  );
}

function isFavoritePlay(play) {
  const odds = getOdds(play);

  if (odds !== null) {
    return odds < 0;
  }

  const pick = getPickText(play);

  return (
    pick.includes(" -1.5") ||
    pick.includes("-1.5") ||
    pick.includes(" favorite")
  );
}

function isUnderdogPlay(play) {
  const odds = getOdds(play);

  if (odds !== null) {
    return odds > 0;
  }

  const pick = getPickText(play);

  return (
    pick.includes(" +1.5") ||
    pick.includes("+1.5") ||
    pick.includes(" underdog")
  );
}

function getSlateBias(plays) {
  const favorites = plays.filter(isFavoritePlay).length;
  const underdogs = plays.filter(isUnderdogPlay).length;

  if (!favorites && !underdogs) {
    return {
      value: "Balanced",
      tone: "neutral",
      detail: "No price bias",
    };
  }

  if (favorites > underdogs) {
    return {
      value: "Favorites",
      tone: "blue",
      detail: `${favorites} favorite plays`,
    };
  }

  if (underdogs > favorites) {
    return {
      value: "Underdogs",
      tone: "green",
      detail: `${underdogs} plus-money plays`,
    };
  }

  return {
    value: "Balanced",
    tone: "neutral",
    detail: `${favorites}-${underdogs} split`,
  };
}

function getSharpSignal(play) {
  return normalize(
    play?.sharp_signal ||
      play?.sharp_book_signal ||
      play?.market_intelligence_signal ||
      play?.sharp_status ||
      ""
  );
}

function hasPositiveSharpSignal(play) {
  const signal = getSharpSignal(play);

  return (
    signal.includes("sharp") ||
    signal.includes("strong") ||
    signal.includes("aligned") ||
    signal.includes("steam") ||
    signal.includes("positive")
  );
}

function hasNegativeSharpSignal(play) {
  const signal = getSharpSignal(play);

  return (
    signal.includes("fade") ||
    signal.includes("negative") ||
    signal.includes("conflict") ||
    signal.includes("reverse")
  );
}

function getSharpBias(plays) {
  const supported = plays.filter(hasPositiveSharpSignal).length;
  const opposed = plays.filter(hasNegativeSharpSignal).length;

  if (!supported && !opposed) {
    return {
      value: "Neutral",
      tone: "neutral",
      detail: "No major signal",
    };
  }

  if (supported > opposed) {
    return {
      value: "Model-Aligned",
      tone: "green",
      detail: `${supported} supported plays`,
    };
  }

  if (opposed > supported) {
    return {
      value: "Mixed",
      tone: "gold",
      detail: `${opposed} conflict signals`,
    };
  }

  return {
    value: "Balanced",
    tone: "neutral",
    detail: `${supported}-${opposed} split`,
  };
}

function isOverPlay(play) {
  const pick = getPickText(play);

  return (
    pick.startsWith("over ") ||
    pick.includes(" over ") ||
    normalize(play?.side) === "over"
  );
}

function isUnderPlay(play) {
  const pick = getPickText(play);

  return (
    pick.startsWith("under ") ||
    pick.includes(" under ") ||
    normalize(play?.side) === "under"
  );
}

function getWeatherText(play) {
  return normalize(
    play?.weather_bias ||
      play?.weather_signal ||
      play?.weather_edge ||
      play?.weather_impact ||
      play?.weather_note ||
      ""
  );
}

function getTotalsBias(plays) {
  let overScore = 0;
  let underScore = 0;

  plays.forEach((play) => {
    if (isOverPlay(play)) {
      overScore += 1;
    }

    if (isUnderPlay(play)) {
      underScore += 1;
    }

    const weather = getWeatherText(play);

    if (
      weather.includes("over") ||
      weather.includes("hitter") ||
      weather.includes("wind out") ||
      weather.includes("offense")
    ) {
      overScore += 1;
    }

    if (
      weather.includes("under") ||
      weather.includes("pitcher") ||
      weather.includes("wind in") ||
      weather.includes("suppression")
    ) {
      underScore += 1;
    }
  });

  if (!overScore && !underScore) {
    return {
      value: "Neutral",
      tone: "neutral",
      detail: "No totals lean",
    };
  }

  if (overScore > underScore) {
    return {
      value: "Over Lean",
      tone: "gold",
      detail: `${overScore} over signals`,
    };
  }

  if (underScore > overScore) {
    return {
      value: "Under Lean",
      tone: "blue",
      detail: `${underScore} under signals`,
    };
  }

  return {
    value: "Balanced",
    tone: "neutral",
    detail: `${overScore}-${underScore} split`,
  };
}

function getBestEdgePlay(plays) {
  return [...plays].sort(
    (a, b) => (numericValue(b?.edge) || 0) - (numericValue(a?.edge) || 0)
  )[0] || null;
}

function getAverageEdge(plays) {
  const edges = plays
    .map((play) => numericValue(play?.edge))
    .filter((value) => value !== null);

  if (!edges.length) {
    return 0;
  }

  return edges.reduce((total, edge) => total + edge, 0) / edges.length;
}

function getBestBook(play) {
  return (
    play?.best_sportsbook ||
    play?.best_book ||
    play?.sportsbook ||
    play?.book ||
    ""
  );
}

function buildBookFrequency(plays) {
  const frequency = new Map();

  plays.forEach((play) => {
    const book = getBestBook(play);

    if (!book) {
      return;
    }

    frequency.set(book, (frequency.get(book) || 0) + 1);
  });

  return [...frequency.entries()].sort((a, b) => b[1] - a[1])[0] || null;
}

function MetricItem({ label, value, detail, tone = "neutral" }) {
  return (
    <div className={`mlb-command-center-item tone-${tone}`}>
      <span className="mlb-command-center-label">{label}</span>
      <strong className="mlb-command-center-value">{value}</strong>
      <small className="mlb-command-center-detail">{detail}</small>
    </div>
  );
}

export default function MLBCommandCenter({
  plays = [],
  marketLabel = "Market",
  loading = false,
}) {
  const data = useMemo(() => {
    const safePlays = Array.isArray(plays) ? plays : [];

    const gameCount = new Set(
      safePlays.map((play, index) => getGameKey(play, index))
    ).size;

    const slateBias = getSlateBias(safePlays);
    const sharpBias = getSharpBias(safePlays);
    const totalsBias = getTotalsBias(safePlays);
    const bestEdgePlay = getBestEdgePlay(safePlays);
    const averageEdge = getAverageEdge(safePlays);
    const topBook = buildBookFrequency(safePlays);

    return {
      gameCount,
      playCount: safePlays.length,
      slateBias,
      sharpBias,
      totalsBias,
      bestEdge: numericValue(bestEdgePlay?.edge) || 0,
      bestEdgePick:
        bestEdgePlay?.pick ||
        bestEdgePlay?.recommendation ||
        bestEdgePlay?.game ||
        "No qualified play",
      bestBook: topBook?.[0] || getBestBook(bestEdgePlay),
      bestBookCount: topBook?.[1] || 0,
      averageEdge,
    };
  }, [plays]);

  return (
    <section
      className="mlb-command-center"
      aria-label={`MLB ${marketLabel} market pulse`}
    >
      <div className="mlb-command-center-heading">
        <div>
          <span className="mlb-command-center-kicker">MLB Market Pulse</span>
          <h2>{marketLabel} Intelligence</h2>
        </div>

        <span
          className={`mlb-command-center-status ${
            loading ? "is-loading" : ""
          }`}
        >
          <i aria-hidden="true" />
          {loading ? "Updating" : "Live Board"}
        </span>
      </div>

      <div className="mlb-command-center-grid">
        <MetricItem
          label="Games / Plays"
          value={loading ? "—" : `${data.gameCount} / ${data.playCount}`}
          detail="Active model board"
          tone="green"
        />

        <MetricItem
          label="Slate Bias"
          value={loading ? "Loading" : data.slateBias.value}
          detail={loading ? "Reading prices" : data.slateBias.detail}
          tone={data.slateBias.tone}
        />

        <MetricItem
          label="Sharp Bias"
          value={loading ? "Loading" : data.sharpBias.value}
          detail={loading ? "Reading market" : data.sharpBias.detail}
          tone={data.sharpBias.tone}
        />

        <MetricItem
          label="Totals Bias"
          value={loading ? "Loading" : data.totalsBias.value}
          detail={loading ? "Reading conditions" : data.totalsBias.detail}
          tone={data.totalsBias.tone}
        />

        <MetricItem
          label="Best Edge"
          value={loading ? "—" : formatPercent(data.bestEdge)}
          detail={loading ? "Ranking plays" : data.bestEdgePick}
          tone="green"
        />

        <MetricItem
          label="Best Book"
          value={loading ? "—" : formatBook(data.bestBook)}
          detail={
            loading
              ? "Comparing prices"
              : data.bestBookCount > 0
                ? `${data.bestBookCount} best-price appearances`
                : "Best available price"
          }
          tone="blue"
        />

        <MetricItem
          label="Average Edge"
          value={loading ? "—" : formatPercent(data.averageEdge)}
          detail={`Across MLB ${marketLabel.toLowerCase()}`}
          tone="gold"
        />
      </div>
    </section>
  );
}
