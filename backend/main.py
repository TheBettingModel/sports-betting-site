import os
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import Base, engine, SessionLocal
from models import Pick

@app.get("/test-api-key")
def test_api_key():
    api_key = os.getenv("ODDS_API_KEY")

    if api_key:
        return {"status": "API key loaded"}
    else:
        return {"status": "API key NOT found"}

app = FastAPI()

Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {"message": "The sports betting website API is functioning normally!"}


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
                "units_won": pick.units if pick.result == "Win" else f"-{pick.units.split()[0]}" if pick.result == "Loss" else "0"
            }
            for pick in picks
        ]
    }


@app.post("/save-pick")
async def save_pick(request: Request):
    data = await request.json()
    db: Session = SessionLocal()

    new_pick = Pick(
        game=data["game"],
        pick=data["pick"],
        market=data["market"],
        sportsbook=data["sportsbook"],
        odds=data["odds"],
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
