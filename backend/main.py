from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import Base, engine, SessionLocal
from models import Pick

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
    return {"message": "Backend is running"}


@app.get("/picks/today")
def get_picks_today():
    return {
        "record": "12-8",
        "units": "+4.5",
        "play_of_the_day": {
            "game": "Lakers vs Celtics",
            "pick": "Lakers +4.5",
            "confidence": "A",
            "units": "3 Units",
            "time": "7:30 PM",
            "reason": "Strong recent form and favorable matchup."
        },
        "other_picks": [
            {
                "game": "Yankees vs Red Sox",
                "pick": "Yankees ML",
                "confidence": "B+",
                "units": "2 Units",
                "time": "6:40 PM",
                "reason": "Pitching edge and strong offensive numbers."
            },
            {
                "game": "Warriors vs Suns",
                "pick": "Over 228.5",
                "confidence": "A-",
                "units": "1.5 Units",
                "time": "10:00 PM",
                "reason": "Both teams are playing at a fast pace."
            }
        ]
    }


@app.get("/results")
def get_results():
    return {
        "results": [
            {
                "date": "2026-04-14",
                "game": "Bucks vs Heat",
                "pick": "Bucks ML",
                "result": "Win",
                "units_won": "+2.0"
            },
            {
                "date": "2026-04-14",
                "game": "Dodgers vs Giants",
                "pick": "Over 8.5",
                "result": "Loss",
                "units_won": "-1.5"
            },
            {
                "date": "2026-04-13",
                "game": "Celtics vs Knicks",
                "pick": "Celtics -6.5",
                "result": "Win",
                "units_won": "+1.5"
            }
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
