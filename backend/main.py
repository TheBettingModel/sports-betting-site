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

# CORS (VERY IMPORTANT FOR VERCEL)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ODDS_API_KEY = os.getenv("ODDS_API_KEY")
ODDS_BASE_URL = "https://api.the-odds-api.com/v4/sports/basketball_nba/odds"


# ------------------------
# Helpers
# ------------------------

def american_to_implied_probability(odds):
    try:
        odds = float(odds)
    except:
        return 0

    if odds > 0:
        return round((100 / (odds + 100)) * 100, 2)
    else:
        return round((abs(odds) / (abs(odds) + 100)) * 100, 2)


# ------------------------
# Routes
# ------------------------

@app.get("/")
def root():
    return {"message": "Backend running"}


@app.get("/get-nba-odds")
def get_nba_odds():
    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "us",
        "markets": "h2h,spreads,totals",
        "oddsFormat": "american",
    }

    response = requests.get(ODDS_BASE_URL, params=params)

    if response.status_code != 200:
        raise HTTPException(status_code=500, detail="Odds API error")

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
def save_pick(data: dict):
    db: Session = SessionLocal()

    try:
        new_pick = Pick(
            game=data.get("game"),
            pick=data.get("pick"),
            market=data.get("market"),
            sportsbook=data.get("sportsbook"),
            odds=str(data.get("odds")),
            confidence=str(data.get("confidence")),
            units=str(data.get("units")),
            model_probability=str(data.get("model_probability")),
            implied_probability=str(data.get("implied_probability")),
            edge=str(data.get("edge")),
            result="Pending"
        )

        db.add(new_pick)
        db.commit()
        db.refresh(new_pick)

        return {"message": "Pick saved", "pick": new_pick.id}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        db.close()


@app.get("/results")
def get_results():
    db: Session = SessionLocal()
    try:
        picks = db.query(Pick).all()

        graded = [
            p for p in picks
            if p.result not in ["Pending", None, ""]
        ]

        return {
            "results": [
                {
                    "game": p.game,
                    "date": "N/A",
                    "pick": p.pick,
                    "result": p.result,
                    "units_won": p.units
                }
                for p in graded
            ]
        }

    finally:
        db.close()


@app.get("/play-of-the-day")
def get_play_of_the_day():
    db: Session = SessionLocal()
    try:
        picks = db.query(Pick).all()

        pending = [p for p in picks if p.result == "Pending"]

        if not pending:
            return {"message": "No play of the day found"}

        def edge_val(p):
            try:
                return float(str(p.edge).replace("%", ""))
            except:
                return 0

        best = sorted(pending, key=edge_val, reverse=True)[0]

        return {"play_of_the_day": best}

    finally:
        db.close()


# ------------------------
# ACTION ROUTES
# ------------------------

@app.put("/update-result/{pick_id}")
def update_result(pick_id: int, data: dict):
    db: Session = SessionLocal()
    try:
        pick = db.query(Pick).filter(Pick.id == pick_id).first()

        if not pick:
            raise HTTPException(status_code=404, detail="Pick not found")

        pick.result = data.get("result")
        db.commit()

        return {"message": "Updated"}

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

        return {"message": "Deleted"}

    finally:
        db.close()
        