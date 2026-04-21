import os
import requests
from dotenv import load_dotenv

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import Base, engine, SessionLocal
from models import Pick

load_dotenv()

app = FastAPI()

Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def american_odds_to_implied_probability(odds):
    odds_value = float(odds)

    if odds_value > 0:
        implied = 100 / (odds_value + 100)
    else:
        implied = abs(odds_value) / (abs(odds_value) + 100)

    return round(implied * 100, 1)


def calculate_confidence(edge_value):
    if edge_value >= 7:
        return "A"
    if edge_value >= 5:
        return "B+"
    if edge_value >= 3:
        return "B"
    if edge_value >= 1:
        return "C"
    return "D"


def starter_model_probability(implied_probability, is_home_team, is_favorite):
    adjustment = 0.0

    if is_home_team:
        adjustment += 1.5

    if is_favorite:
        adjustment += 1.0

    model_probability = implied_probability + adjustment

    if model_probability > 95:
        model_probability = 95.0

    return round(model_probability, 1)


@app.get("/")
def home():
    return {"message": "The sports betting website API is functioning normally!"}


@app.get("/test-api-key")
def test_api_key():
    api_key = os.getenv("ODDS_API_KEY")

    if api_key:
        return {"status": "API key loaded"}
    else:
        return {"status": "API key NOT found"}


@app.get("/get-nba-odds")
def get_nba_odds():
    api_key = os.getenv("ODDS_API_KEY")

    if not api_key:
        return {"error": "ODDS_API_KEY not found"}

    url = "https://api.the-odds-api.com/v4/sports/basketball_nba/odds"

    params = {
        "apiKey": api_key,
        "regions": "us",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "american"
    }

    response = requests.get(url, params=params)

    if response.status_code != 200:
        return {
            "error": "Failed to fetch odds",
            "status_code": response.status_code,
            "details": response.text
        }

    return response.json()


@app.get("/model/nba/today")
def model_nba_today():
    api_key = os.getenv("ODDS_API_KEY")

    if not api_key:
        return {"error": "ODDS_API_KEY not found"}

    url = "https://api.the-odds-api.com/v4/sports/basketball_nba/odds"

    params = {
        "apiKey": api_key,
        "regions": "us",
        "markets": "h2h,spreads",
        "oddsFormat": "american"
    }

    response = requests.get(url, params=params)

    if response.status_code != 200:
        return {
            "error": "Failed to fetch odds",
            "status_code": response.status_code,
            "details": response.text
        }

    odds_data = response.json()
    model_games = []

    for game in odds_data:
        if not game.get("bookmakers"):
            continue

        bookmaker = game["bookmakers"][0]
        if not bookmaker.get("markets"):
            continue

        moneyline_market = None
        spread_market = None

        for market in bookmaker["markets"]:
            if market["key"] == "h2h":
                moneyline_market = market
            elif market["key"] == "spreads":
                spread_market = market

        if moneyline_market:
            for outcome in moneyline_market["outcomes"]:
                implied_probability = american_odds_to_implied_probability(outcome["price"])
                is_home_team = outcome["name"] == game["home_team"]
                is_favorite = outcome["price"] < 0

                model_probability = starter_model_probability(
                    implied_probability=implied_probability,
                    is_home_team=is_home_team,
                    is_favorite=is_favorite
                )

                edge = round(model_probability - implied_probability, 1)
                confidence = calculate_confidence(edge)

                model_games.append({
                    "game": f'{game["away_team"]} vs {game["home_team"]}',
                    "commence_time": game["commence_time"],
                    "sportsbook": bookmaker["title"],
                    "market": "Moneyline",
                    "pick": outcome["name"],
                    "odds": outcome["price"],
                    "implied_probability": f"{implied_probability}%",
                    "model_probability": f"{model_probability}%",
                    "edge": f"{edge}%",
                    "confidence": confidence,
                    "recommendation": "Play" if edge >= 3 else "Lean" if edge >= 1 else "Pass"
                })

        if spread_market:
            for outcome in spread_market["outcomes"]:
                implied_probability = american_odds_to_implied_probability(outcome["price"])
                is_home_team = outcome["name"] == game["home_team"]
                point = outcome.get("point", 0)

                adjustment = 0.0

                if is_home_team:
                    adjustment += 1.0

                if point > 0:
                    adjustment += 1.0

                model_probability = round(implied_probability + adjustment, 1)

                if model_probability > 95:
                    model_probability = 95.0

                edge = round(model_probability - implied_probability, 1)
                confidence = calculate_confidence(edge)

                point_text = f"+{point}" if point > 0 else str(point)

                model_games.append({
                    "game": f'{game["away_team"]} vs {game["home_team"]}',
                    "commence_time": game["commence_time"],
                    "sportsbook": bookmaker["title"],
                    "market": "Spread",
                    "pick": f'{outcome["name"]} {point_text}',
                    "odds": outcome["price"],
                    "implied_probability": f"{implied_probability}%",
                    "model_probability": f"{model_probability}%",
                    "edge": f"{edge}%",
                    "confidence": confidence,
                  "recommendation": "Play" if edge >= 2 else "Lean" if edge >= 0.5 else "Pass"
                  
                })

    model_games = sorted(
        model_games,
        key=lambda x: float(x["edge"].replace("%", "")),
        reverse=True
    )

    return {
        "sport": "NBA",
        "model_version": "v1-moneyline-spread",
        "games": model_games
    }


@app.get("/picks/today")
def get_picks_today():
    db: Session = SessionLocal()
    picks = db.query(Pick).all()
    db.close()

    if not picks:
        return {
            "record": "0-0",
            "units": "0.00",
            "play_of_the_day": None,
            "other_picks": []
        }

    def edge_to_number(edge_value):
        if not edge_value:
            return 0
        return float(str(edge_value).replace("%", "").strip())

    sorted_picks = sorted(
        picks,
        key=lambda pick: edge_to_number(pick.edge),
        reverse=True
    )

    best_pick = sorted_picks[0]
    other_picks = sorted_picks[1:]

    def units_to_float(unit_value):
        try:
            return float(str(unit_value).split()[0])
        except Exception:
            return 0.0

    net_units = 0.0
    wins = 0
    losses = 0

    for pick in picks:
        unit_value = units_to_float(pick.units)
        try:
            odds_value = float(str(pick.odds))
        except Exception:
            odds_value = 0.0

        if pick.result == "Win":
            wins += 1
            if odds_value > 0:
                net_units += unit_value * (odds_value / 100)
            elif odds_value < 0:
                net_units += unit_value * (100 / abs(odds_value))
            else:
                net_units += unit_value
        elif pick.result == "Loss":
            losses += 1
            net_units -= unit_value

    return {
        "record": f"{wins}-{losses}",
        "units": f"{net_units:.2f}",
        "play_of_the_day": {
            "id": best_pick.id,
            "game": best_pick.game,
            "pick": best_pick.pick,
            "market": best_pick.market,
            "sportsbook": best_pick.sportsbook,
            "odds": best_pick.odds,
            "confidence": best_pick.confidence,
            "units": best_pick.units,
            "model_probability": best_pick.model_probability,
            "implied_probability": best_pick.implied_probability,
            "edge": best_pick.edge,
            "result": best_pick.result,
            "time": "TBD",
            "reason": "Highest edge among saved picks."
        },
        "other_picks": [
            {
                "id": pick.id,
                "game": pick.game,
                "pick": pick.pick,
                "market": pick.market,
                "sportsbook": pick.sportsbook,
                "odds": pick.odds,
                "confidence": pick.confidence,
                "units": pick.units,
                "model_probability": pick.model_probability,
                "implied_probability": pick.implied_probability,
                "edge": pick.edge,
                "result": pick.result,
                "time": "TBD",
                "reason": "Model-ranked saved pick."
            }
            for pick in other_picks
        ]
    }


@app.get("/results")
def get_results():
    db: Session = SessionLocal()
    picks = db.query(Pick).filter(Pick.result.in_(["Win", "Loss", "Push"])).all()
    db.close()

    return {
        "results": [
            {
                "date": "Live",
                "game": pick.game,
                "pick": pick.pick,
                "result": pick.result,
                "units_won": (
                    pick.units
                    if pick.result == "Win"
                    else f"-{pick.units.split()[0]}"
                    if pick.result == "Loss"
                    else "0"
                )
            }
            for pick in picks
        ]
    }


@app.post("/save-pick")
async def save_pick(request: Request):
    data = await request.json()
    db: Session = SessionLocal()

    existing_pick = db.query(Pick).filter(
        Pick.game == data["game"],
        Pick.pick == data["pick"],
        Pick.market == data["market"],
        Pick.sportsbook == data["sportsbook"],
        Pick.odds == str(data["odds"])
    ).first()

    if existing_pick:
        db.close()
        return {"message": "Pick already exists"}

    new_pick = Pick(
        game=data["game"],
        pick=data["pick"],
        market=data["market"],
        sportsbook=data["sportsbook"],
        odds=str(data["odds"]),
        confidence=data["confidence"],
        units=data["units"],
        model_probability=data["model_probability"],
        implied_probability=data["implied_probability"],
        edge=data["edge"]
    )

    db.add(new_pick)
    db.commit()
    db.refresh(new_pick)
    db.close()

    return {"message": "Pick saved successfully"}


@app.get("/saved-picks")
def get_saved_picks():
    db: Session = SessionLocal()
    picks = db.query(Pick).all()
    db.close()

    def edge_to_number(edge_value):
        if not edge_value:
            return 0
        return float(str(edge_value).replace("%", "").strip())

    sorted_picks = sorted(
        picks,
        key=lambda pick: edge_to_number(pick.edge),
        reverse=True
    )

    return {
        "saved_picks": [
            {
                "id": pick.id,
                "game": pick.game,
                "pick": pick.pick,
                "market": pick.market,
                "sportsbook": pick.sportsbook,
                "odds": pick.odds,
                "confidence": pick.confidence,
                "units": pick.units,
                "model_probability": pick.model_probability,
                "implied_probability": pick.implied_probability,
                "edge": pick.edge,
                "result": pick.result
            }
            for pick in sorted_picks
        ]
    }


@app.get("/play-of-the-day")
def get_play_of_the_day():
    db: Session = SessionLocal()
    picks = db.query(Pick).all()
    db.close()

    if not picks:
        return {"message": "No saved picks available"}

    def edge_to_number(edge_value):
        if not edge_value:
            return 0
        return float(str(edge_value).replace("%", "").strip())

    best_pick = max(picks, key=lambda pick: edge_to_number(pick.edge))

    return {
        "play_of_the_day": {
            "id": best_pick.id,
            "game": best_pick.game,
            "pick": best_pick.pick,
            "market": best_pick.market,
            "sportsbook": best_pick.sportsbook,
            "odds": best_pick.odds,
            "confidence": best_pick.confidence,
            "units": best_pick.units,
            "model_probability": best_pick.model_probability,
            "implied_probability": best_pick.implied_probability,
            "edge": best_pick.edge,
            "result": best_pick.result
        }
    }


@app.delete("/delete-pick/{pick_id}")
def delete_pick(pick_id: int):
    db: Session = SessionLocal()
    pick = db.query(Pick).filter(Pick.id == pick_id).first()

    if not pick:
        db.close()
        return {"message": "Pick not found"}

    db.delete(pick)
    db.commit()
    db.close()

    return {"message": "Pick deleted successfully"}


@app.put("/update-result/{pick_id}")
async def update_result(pick_id: int, request: Request):
    data = await request.json()
    db: Session = SessionLocal()

    pick = db.query(Pick).filter(Pick.id == pick_id).first()

    if not pick:
        db.close()
        return {"message": "Pick not found"}

    pick.result = data["result"]
    db.commit()
    db.refresh(pick)
    db.close()

    return {"message": "Result updated successfully"}
