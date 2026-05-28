from sqlalchemy import Column, Integer, String, Text
from database import Base

class Pick(Base):
    __tablename__ = "picks"

    id = Column(Integer, primary_key=True, index=True)
    game = Column(String, index=True)
    pick = Column(String)
    market = Column(String)
    sportsbook = Column(String)
    odds = Column(String)
    confidence = Column(String)
    units = Column(String)
    model_probability = Column(String)
    implied_probability = Column(String)
    edge = Column(String)
    result = Column(String, default="Pending")

    # CLV tracking
    closing_line = Column(String, default="")
    closing_odds = Column(String, default="")
    clv_result = Column(String, default="")
    clv_value = Column(String, default="")
    # Performance dashboard tracking
    sport = Column(String, default="")
    sharp_signal = Column(String, default="")
    steam_strength = Column(String, default="")
    line_disagreement = Column(String, default="")
    top_play_score = Column(String, default="")
    line_shop_value = Column(String, default="")
    recommendation = Column(String, default="")


class CacheEntry(Base):
    __tablename__ = "cache_entries"

    id = Column(Integer, primary_key=True, index=True)
    cache_key = Column(String, unique=True, index=True)
    payload = Column(Text)
    
class LineSnapshot(Base):
    __tablename__ = "line_snapshots"

    id = Column(Integer, primary_key=True, index=True)

    line_key = Column(String, unique=True, index=True)

    game = Column(String, index=True)
    market = Column(String, index=True)
    pick = Column(String, index=True)
    sportsbook = Column(String, index=True)

    opening_odds = Column(Integer)
    current_odds = Column(Integer)

    created_at = Column(String)
    updated_at = Column(String)


class ModelPlayHistory(Base):
    __tablename__ = "model_play_history"

    id = Column(Integer, primary_key=True, index=True)

    date = Column(String, index=True)
    sport = Column(String, index=True)
    game = Column(String, index=True)
    pick = Column(String, index=True)
    market = Column(String, index=True)
    sportsbook = Column(String, index=True)

    odds = Column(String)
    edge = Column(String)
    confidence = Column(String)
    recommendation = Column(String)

    top_play_score = Column(String)
    sharp_signal = Column(String)
    steam_strength = Column(String)
    line_disagreement = Column(String)
    line_shop_value = Column(String)
    clv_status = Column(String)

    result = Column(String, default="Pending")
    units_result = Column(String, default="")
    closing_odds = Column(String, default="")
    model_version = Column(String, default="")

