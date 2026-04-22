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


class CacheEntry(Base):
    __tablename__ = "cache_entries"

    id = Column(Integer, primary_key=True, index=True)
    cache_key = Column(String, unique=True, index=True)
    payload = Column(Text)
    