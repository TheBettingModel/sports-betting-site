from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"message": "Backend is live"}

@app.get("/picks/today")
def picks_today():
    return {"status": "picks route works"}

@app.get("/saved-picks")
def saved_picks():
    return {"saved_picks": []}
