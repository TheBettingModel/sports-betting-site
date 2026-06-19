from pathlib import Path

path = Path("main.py")
text = path.read_text()

nfl_endpoint = r'''
@app.get("/model/nfl/today")
def model_nfl_today():
    cached = get_cache("nfl_model")

    odds_api_key = os.getenv("ODDS_API_KEY")

    if not odds_api_key:
        return {"plays": [], "error": "Missing ODDS_API_KEY"}

    params = {
        "apiKey": odds_api_key,
        "regions": "us",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "american",
    }

    try:
        response = requests.get(
            NFL_ODDS_BASE_URL,
            params=params,
            timeout=10
        )

        if response.status_code != 200:
            if cached:
                return {"plays": cached, "cached": True, "error": response.text}
            return {"plays": [], "error": response.text}

        games = response.json()
        plays = []

        for game in games:
            home_team = game.get("home_team")
            away_team = game.get("away_team")
            game_name = f"{away_team} vs {home_team}"

            for bookmaker in game.get("bookmakers", []):
                sportsbook = bookmaker.get("title")

                for market in bookmaker.get("markets", []):
                    market_key = market.get("key")

                    if market_key == "h2h":
                        market_name = "Moneyline"
                    elif market_key == "spreads":
                        market_name = "Spread"
                    elif market_key == "totals":
                        market_name = "Total"
                    else:
                        continue

                    for outcome in market.get("outcomes", []):
                        pick_name = outcome.get("name")
                        odds = outcome.get("price")
                        point = outcome.get("point")

                        if odds is None:
                            continue

                        if market_name in ["Spread", "Total"]:
                            pick_display = f"{pick_name} {point}"
                        else:
                            pick_display = pick_name

                        implied = american_to_implied_probability(odds)

                        team_rating = NFL_TEAM_RATINGS.get(pick_name, 78)

                        if pick_name == home_team:
                            opponent = away_team
                            home_adj = 1.5
                        elif pick_name == away_team:
                            opponent = home_team
                            home_adj = -1.5
                        else:
                            opponent = None
                            home_adj = 0

                        opponent_rating = NFL_TEAM_RATINGS.get(opponent, 78)

                        rating_diff = team_rating - opponent_rating
                        rating_adj = rating_diff * 0.35
                        price_adj = get_price_adjustment(odds)

                        if market_name == "Total":
                            model_prob = implied + price_adj
                            reason = (
                                f"NFL totals v1. Price adjustment ({price_adj}). "
                                "Weather, pace, and matchup layers will be added in later versions."
                            )
                        else:
                            model_prob = implied + rating_adj + home_adj + price_adj
                            reason = (
                                f"NFL rating edge ({round(rating_diff, 2)}). "
                                f"Rating adjustment ({round(rating_adj, 2)}). "
                                f"Home field adjustment ({home_adj}). "
                                f"Price adjustment ({price_adj})."
                            )

                        model_prob = max(1, min(99, model_prob))
                        edge = round(model_prob - implied, 2)

                        if edge >= 4:
                            recommendation = "Play"
                        elif edge >= 2:
                            recommendation = "Lean"
                        else:
                            recommendation = "Pass"

                        if edge >= 5:
                            confidence = 90
                        elif edge >= 4:
                            confidence = 84
                        elif edge >= 3:
                            confidence = 78
                        elif edge >= 2:
                            confidence = 72
                        else:
                            confidence = 60

                        units = get_dynamic_units(
                            edge,
                            confidence,
                            recommendation
                        )

                        play = {
                            "game": game_name,
                            "sportsbook": sportsbook,
                            "market": market_name,
                            "pick": pick_display,
                            "odds": odds,
                            "implied_probability": round(implied, 2),
                            "model_probability": round(model_prob, 2),
                            "edge": edge,
                            "confidence": confidence,
                            "recommendation": recommendation,
                            "units": units,
                            "sport": "NFL",
                            "model_version": "nfl_v1_market_engine",
                            "team_rating": team_rating,
                            "opponent_rating": opponent_rating,
                            "rating_diff": round(rating_diff, 2),
                            "rating_adjustment": round(rating_adj, 2),
                            "home_field_adjustment": home_adj,
                            "price_adjustment": price_adj,
                            "reason": reason,
                        }

                        play.update(get_sharp_sportsbook_weight(sportsbook))

                        play.update(
                            get_sharp_market_signal(
                                edge,
                                odds,
                                recommendation
                            )
                        )

                        line_key = get_line_key(
                            game_name,
                            market_name,
                            pick_display,
                            sportsbook
                        )

                        opening_odds = get_or_create_line_snapshot(
                            line_key,
                            odds
                        )

                        play.update(
                            get_line_movement_signal(
                                opening_odds,
                                odds
                            )
                        )

                        play.update(
                            get_clv_signal(
                                opening_odds,
                                odds
                            )
                        )

                        play.update(
                            get_live_clv_tracker(
                                opening_odds,
                                odds,
                                edge,
                                recommendation
                            )
                        )

                        play.update(get_market_timing_signal(play))

                        plays.append(play)

        best_by_game_market = {}

        for play in plays:
            key = f"{play.get('game')}|{play.get('market')}"

            if key not in best_by_game_market:
                best_by_game_market[key] = play
            elif play.get("edge", 0) > best_by_game_market[key].get("edge", 0):
                best_by_game_market[key] = play

        final = sorted(
            list(best_by_game_market.values()),
            key=lambda x: x.get("edge", 0),
            reverse=True
        )

        for play in final:
            play["auto_pod_score"] = get_auto_pod_score(play)

        save_model_play_history("NFL", final)
        set_cache("nfl_model", final)

        return {"plays": final}

    except Exception as e:
        if cached:
            return {"plays": cached, "cached": True, "error": str(e)}
        return {"plays": [], "error": str(e)}

'''

marker = '@app.get("/model/nba/today")'
if '@app.get("/model/nfl/today")' not in text:
    text = text.replace(marker, nfl_endpoint + marker)
else:
    print("NFL endpoint already exists")

old_refresh = '''@app.post("/refresh/nfl")
def refresh_nfl_models():
    ...
'''

new_refresh = '''@app.post("/refresh/nfl")
def refresh_nfl_models():
    try:
        response = model_nfl_today()

        return {
            "success": True,
            "date": str(date.today()),
            "count": len(response.get("plays", [])),
            "response": response,
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }

'''

if old_refresh in text:
    text = text.replace(old_refresh, new_refresh)
elif '@app.post("/refresh/nfl")' not in text:
    text = text.replace('@app.post("/refresh/nba")', new_refresh + '@app.post("/refresh/nba")')
else:
    print("NFL refresh already exists but did not match placeholder")

path.write_text(text)
print("NFL v1 inserted.")
