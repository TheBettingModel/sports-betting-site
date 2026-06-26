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

    clv_score = Column(String, default="")
    live_clv_grade = Column(String, default="")
    model_validated_by_market = Column(String, default="")

    pitcher_rating_diff = Column(String, default="")
    pitcher_diff_adjustment = Column(String, default="")
    statcast_pitching_rating = Column(String, default="")
    statcast_pitching_adjustment = Column(String, default="")

    statcast_power_rating = Column(String, default="")
    statcast_power_adjustment = Column(String, default="")
    hitting_rating = Column(String, default="")
    hitting_adjustment = Column(String, default="")

    bullpen_availability_score = Column(String, default="")
    bullpen_availability_adjustment = Column(String, default="")
    high_leverage_risk = Column(String, default="")

    lineup_strength = Column(String, default="")
    lineup_adjustment = Column(String, default="")

    weather_adjustment = Column(String, default="")
    umpire_adjustment = Column(String, default="")

    consensus_price = Column(String, default="")
    market_spread = Column(String, default="")
    market_disagreement = Column(String, default="")
    stale_line_opportunity = Column(String, default="")

    result = Column(String, default="Pending")
    units_result = Column(String, default="")
    closing_odds = Column(String, default="")
    model_version = Column(String, default="")
    final_model_score = Column(String, default="")
    final_model_tier = Column(String, default="")
    final_recommendation = Column(String, default="")
    final_stars = Column(String, default="")
    market_intelligence_score = Column(String, default="")
    market_intelligence_grade = Column(String, default="")
    market_intelligence_signal = Column(String, default="")

