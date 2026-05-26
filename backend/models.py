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

    