from pathlib import Path

p = Path("main.py")
text = p.read_text()

helper = r'''
def get_universal_market_intelligence(play, all_plays):
    price_data = get_best_sportsbook_price(play, all_plays)

    score = 0
    reasons = []

    line_shop_value = price_data.get("line_shop_value", 0) or 0
    line_disagreement = price_data.get("line_disagreement", "Low")
    stale_line = price_data.get("stale_line", False)

    sharp_score = play.get("sharp_score", 0) or 0
    sharp_book_score = play.get("sharp_book_score", 60) or 60

    if line_shop_value >= 25:
        score += 4
        reasons.append("Major sportsbook price gap.")
    elif line_shop_value >= 10:
        score += 2
        reasons.append("Meaningful line shopping edge.")
    else:
        reasons.append("Market prices mostly aligned.")

    if line_disagreement == "High":
        score += 2
        reasons.append("High market disagreement.")
    elif line_disagreement == "Moderate":
        score += 1
        reasons.append("Moderate market disagreement.")

    if stale_line:
        score += 3
        reasons.append("Possible stale line opportunity.")

    if sharp_score >= 4:
        score += 2
        reasons.append("Strong sharp/value signal.")
    elif sharp_score >= 2:
        score += 1
        reasons.append("Positive sharp/value signal.")
    elif sharp_score < 0:
        score -= 1
        reasons.append("Weak market signal.")

    if sharp_book_score >= 90:
        score += 2
        reasons.append("Market-maker sportsbook involved.")
    elif sharp_book_score >= 75:
        score += 1
        reasons.append("Sharp-influenced sportsbook involved.")

    if score >= 8:
        grade = "A"
        signal = "Strong Market Edge"
    elif score >= 5:
        grade = "B"
        signal = "Positive Market Edge"
    elif score >= 2:
        grade = "C"
        signal = "Neutral Market Edge"
    else:
        grade = "D"
        signal = "Weak Market Edge"

    return {
        **price_data,
        "market_intelligence_score": score,
        "market_intelligence_grade": grade,
        "market_intelligence_signal": signal,
        "market_intelligence_reasons": reasons,
    }

'''

if "def get_universal_market_intelligence" not in text:
    text = text.replace("def get_line_key(game, market, pick, sportsbook):", helper + "\ndef get_line_key(game, market, pick, sportsbook):")

# Add market intelligence before every final return
target = '''        return {"plays": final}'''
replacement = '''        for play in final:
            play.update(get_universal_market_intelligence(play, plays))

        return {"plays": final}'''

text = text.replace(target, replacement)

p.write_text(text)

print("Universal Market Intelligence v2 added and plugged into final outputs.")
