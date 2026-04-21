from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from datetime import datetime
import os
import requests

from database import SessionLocal, engine
from models import Base, Pick

load_dotenv()

app = FastAPI()

Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_origins=[
        "http://localhost:5173",
        "https://sports-betting-site-xi.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ODDS_API_KEY = os.getenv("ODDS_API_KEY")
ODDS_BASE_URL = "https://api.the-odds-api.com/v4/sports/basketball_nba/odds"


def american_to_implied_probability(odds):
    if odds is None:
        return 0.0

    try:
        odds = float(odds)
    except (TypeError, ValueError):
        return 0.0

    if odds > 0:
        return round((100 / (odds + 100)) * 100, 2)
    else:
        return round((abs(odds) / (abs(odds) + 100)) * 100, 2)


def get_unit_size(edge):
    if edge >= 4.0:
        return 2
    elif edge >= 2.0:
        return 1.5
    elif edge >= 0.5:
        return 1
    return 0


def calculate_model_data(market, pick, odds):
    implied_probability = american_to_implied_probability(odds)
    model_probability = implied_probability

    if market == "Moneyline":
        if implied_probability < 50:
            model_probability = implied_probability + 3.0
        else:
            model_probability = implied_probability + 1.5

    elif market == "Spread":
        model_probability = implied_probability + 2.0

    elif market == "Total":
        try:
            parts = str(pick).split()
            side = parts[0]
            total_points = float(parts[1])

            baseline_total = 228
            diff = total_points - baseline_total
            adjustment = diff * 0.25

            if side == "Over":
                model_probability = 50 - adjustment
            elif side == "Under":
                model_probability = 50 + adjustment
            else:
                model_probability = 50

            model_probability = max(45, min(55, model_probability))
        except Exception:
            model_probability = implied_probability

    edge = round(model_probability - implied_probability, 2)
    confidence = min(95, max(50, round(model_probability + (edge * 2), 1)))

    return {
        "implied_probability": round(implied_probability, 2),
        "model_probability": round(model_probability, 2),
        "edge": round(edge, 2),
        "confidence": confidence,
    }


@app.get("/")
def root():
    return {"message": "Sports betting backend is running"}


@app.get("/test-api-key")
def test_api_key():
    if not ODDS_API_KEY:
        raise HTTPException(status_code=500, detail="ODDS_API_KEY is missing")

    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "us",
        "markets": "h2h",
        "oddsFormat": "american",
    }

    response = requests.get(ODDS_BASE_URL, params=params)

    return {
        "status_code": response.status_code,
        "response_text": response.text[:500]
    }


@app.get("/get-nba-odds")
def get_nba_odds():
    if not ODDS_API_KEY:
        raise HTTPException(status_code=500, detail="ODDS_API_KEY is missing")

    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "us",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "american",
        "bookmakers": "draftkings,fanduel,betmgm,caesars"
    }

    response = requests.get(ODDS_BASE_URL, params=params)

    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=response.text)

    return response.json()


@app.get("/picks")
@app.get("/saved-picks")
def get_picks():
    db: Session = SessionLocal()
    try:
        picks = db.query(Pick).order_by(Pick.id.desc()).all()
        return picks
    finally:
        db.close()



@app.post("/save-pick")
def save_pick(pick_data: dict):
    db: Session = SessionLocal()

    try:
        game = pick_data.get("game")
        pick = pick_data.get("pick")
        market = pick_data.get("market")
        sportsbook = pick_data.get("sportsbook")
        odds = pick_data.get("odds")

        if not game or not pick or not market or not sportsbook or odds is None:
            raise HTTPException(status_code=400, detail="Missing required pick fields")

        existing_pick = db.query(Pick).filter(
            Pick.game == game,
            Pick.pick == pick,
            Pick.market == market,
            Pick.sportsbook == sportsbook,
            Pick.odds == str(odds)
        ).first()

        if existing_pick:
            return {
                "message": "Duplicate pick already exists",
                "duplicate": True,
                "pick_id": existing_pick.id
            }

        new_pick = Pick(
            game=game,
            pick=pick,
            market=market,
            sportsbook=sportsbook,
            odds=str(odds),
            confidence=str(pick_data.get("confidence", "")),
            units=str(pick_data.get("units") or pick_data.get("stake") or ""),
            model_probability=str(pick_data.get("model_probability", "")),
            implied_probability=str(pick_data.get("implied_probability", "")),
            edge=str(pick_data.get("edge", "")),
            result=str(pick_data.get("result", "Pending"))
        )

        db.add(new_pick)
        db.commit()
        db.refresh(new_pick)

        return {
            "message": "Pick saved successfully",
            "duplicate": False,
            "pick": {
                "id": new_pick.id,
                "game": new_pick.game,
                "pick": new_pick.pick,
                "market": new_pick.market,
                "sportsbook": new_pick.sportsbook,
                "odds": new_pick.odds,
                "confidence": new_pick.confidence,
                "units": new_pick.units,
                "model_probability": new_pick.model_probability,
                "implied_probability": new_pick.implied_probability,
                "edge": new_pick.edge,
                "result": new_pick.result
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Save pick error: {str(e)}")
    finally:
        db.close()


@app.get("/model/nba/today")
def model_nba_today():
    if not ODDS_API_KEY:
        raise HTTPException(status_code=500, detail="ODDS_API_KEY is missing")

    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "us",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "american",
        "bookmakers": "draftkings,fanduel,betmgm,caesars"
    }

    response = requests.get(ODDS_BASE_URL, params=params)

    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=response.text)

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
                outcomes = market.get("outcomes", [])

                if market_key == "h2h":
                    for outcome in outcomes:
                        team_name = outcome.get("name")
                        odds = outcome.get("price")

                        if team_name is None or odds is None:
                            continue

                        model_data = calculate_model_data("Moneyline", team_name, odds)
                        edge = model_data["edge"]

                        if edge >= 2:
                            recommendation = "Play"
                        elif edge >= 0.5:
                            recommendation = "Lean"
                        else:
                            recommendation = "Pass"

                        plays.append({
                            "game": game_name,
                            "commence_time": game.get("commence_time"),
                            "sportsbook": sportsbook,
                            "market": "Moneyline",
                            "pick": team_name,
                            "odds": odds,
                            "implied_probability": model_data["implied_probability"],
                            "model_probability": model_data["model_probability"],
                            "edge": model_data["edge"],
                            "confidence": model_data["confidence"],
                            "recommendation": recommendation,
                            "units": get_unit_size(edge)
                        })

                elif market_key == "spreads":
                    for outcome in outcomes:
                        team_name = outcome.get("name")
                        odds = outcome.get("price")
                        point = outcome.get("point")

                        if team_name is None or odds is None or point is None:
                            continue

                        spread_pick = f"{team_name} {point:+}"

                        model_data = calculate_model_data("Spread", spread_pick, odds)
                        edge = model_data["edge"]

                        if edge >= 2:
                            recommendation = "Play"
                        elif edge >= 0.5:
                            recommendation = "Lean"
                        else:
                            recommendation = "Pass"

                        plays.append({
                            "game": game_name,
                            "commence_time": game.get("commence_time"),
                            "sportsbook": sportsbook,
                            "market": "Spread",
                            "pick": spread_pick,
                            "odds": odds,
                            "implied_probability": model_data["implied_probability"],
                            "model_probability": model_data["model_probability"],
                            "edge": model_data["edge"],
                            "confidence": model_data["confidence"],
                            "recommendation": recommendation,
                            "units": get_unit_size(edge)
                        })

                elif market_key == "totals":
                    for outcome in outcomes:
                        side = outcome.get("name")
                        odds = outcome.get("price")
                        total_points = outcome.get("point")

                        if side is None or odds is None or total_points is None:
                            continue

                        total_pick = f"{side} {total_points}"

                        model_data = calculate_model_data("Total", total_pick, odds)
                        edge = model_data["edge"]

                        if edge >= 2:
                            recommendation = "Play"
                        elif edge >= 0.5:
                            recommendation = "Lean"
                        else:
                            recommendation = "Pass"

                        plays.append({
                            "game": game_name,
                            "commence_time": game.get("commence_time"),
                            "sportsbook": sportsbook,
                            "market": "Total",
                            "pick": total_pick,
                            "odds": odds,
                            "implied_probability": model_data["implied_probability"],
                            "model_probability": model_data["model_probability"],
                            "edge": model_data["edge"],
                            "confidence": model_data["confidence"],
                            "recommendation": recommendation,
                            "units": get_unit_size(edge)
                        })

    plays.sort(key=lambda x: x["edge"], reverse=True)

    return {
        "date": datetime.utcnow().isoformat(),
        "total_plays": len(plays),
        "plays": plays
    }


@app.get("/play-of-the-day")
def get_play_of_the_day():
    db: Session = SessionLocal()
    try:
        picks = db.query(Pick).all()

        if not picks:
            return {"message": "No play of the day found."}

        pending_picks = [pick for pick in picks if pick.result == "Pending" or not pick.result]

        if not pending_picks:
            return {"message": "No play of the day found."}

        def edge_value(pick):
            try:
                return float(str(pick.edge).replace("%", ""))
            except Exception:
                return 0.0

        best_pick = sorted(pending_picks, key=edge_value, reverse=True)[0]

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
    finally:
        db.close()

@app.get("/results")
def get_results():
    db: Session = SessionLocal()
    try:
        picks = db.query(Pick).order_by(Pick.id.desc()).all()

        graded_picks = [
            pick for pick in picks
            if pick.result and pick.result not in ["Pending", ""]
        ]

        results = []
        for pick in graded_picks:
            results.append({
                "game": pick.game,
                "date": "N/A",
                "pick": pick.pick,
                "result": pick.result,
                "units_won": pick.units
            })

        return {"results": results}
    finally:
        db.close()

        @app.delete("/delete-pick/{pick_id}")
def delete_pick(pick_id: int):
    db: Session = SessionLocal()
    try:
        pick = db.query(Pick).filter(Pick.id == pick_id).first()

        if not pick:
            raise HTTPException(status_code=404, detail="Pick not found")

        db.delete(pick)
        db.commit()

        return {"message": "Pick deleted successfully"}
    finally:
        db.close()


@app.put("/update-result/{pick_id}")
def update_result(pick_id: int, data: dict):
    db: Session = SessionLocal()
    try:
        pick = db.query(Pick).filter(Pick.id == pick_id).first()

        if not pick:
            raise HTTPException(status_code=404, detail="Pick not found")

        result = data.get("result")

        if result not in ["Win", "Loss", "Push"]:
            raise HTTPException(status_code=400, detail="Invalid result")

        pick.result = result
        db.commit()

        return {"message": "Result updated successfully"}
    finally:
        db.close()