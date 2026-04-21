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

# Create database tables
Base.metadata.create_all(bind=engine)

# CORS
app.add_middleware(
    CORSMiddleware,
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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def american_to_implied_probability(odds):
    if odds is None:
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
    edge = 0.0
    confidence = 50.0

    if market == "Moneyline":
        # Simple starter logic
        if implied_probability < 50:
            model_probability = implied_probability + 3.0
        else:
            model_probability = implied_probability + 1.5

    elif market == "Spread":
        # Simple starter logic
        model_probability = implied_probability + 2.0

    elif market == "Total":
        # Simple starter totals logic
        # pick examples: "Over 228.5" or "Under 228.5"
        try:
            parts = str(pick).split()
            side = parts[0]
            total_points = float(parts[1])

            if total_points <= 218:
                if side == "Over":
                    model_probability = 53.0
                elif side == "Under":
                    model_probability = 47.0
            elif total_points >= 234:
                if side == "Under":
                    model_probability = 53.0
                elif side == "Over":
                    model_probability = 47.0
            else:
                model_probability = 50.0
        except:
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

        existing_pick = db.query(Pick).filter(
            Pick.game == game,
            Pick.pick == pick,
            Pick.market == market,
            Pick.sportsbook == sportsbook,
            Pick.odds == odds
        ).first()

        if existing_pick:
            return {
                "message": "Duplicate pick already exists",
                "duplicate": True,
                "pick_id": existing_pick.id
            }

        new_pick = Pick(
            game=game,
            market=market,
            pick=pick,
            odds=odds,
            sportsbook=sportsbook,
            stake=pick_data.get("stake"),
            result=pick_data.get("result", "Pending"),
            commence_time=pick_data.get("commence_time"),
            implied_probability=pick_data.get("implied_probability"),
            model_probability=pick_data.get("model_probability"),
            edge=pick_data.get("edge"),
            confidence=pick_data.get("confidence"),
            recommendation=pick_data.get("recommendation"),
            notes=pick_data.get("notes")
        )

        db.add(new_pick)
        db.commit()
        db.refresh(new_pick)

        return {
            "message": "Pick saved successfully",
            "duplicate": False,
            "pick": new_pick
        }

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

                # MONEYLINE
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

                # SPREADS
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

                # TOTALS
                elif market_key == "totals":
                    for outcome in outcomes:
                        side = outcome.get("name")   # Over or Under
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
