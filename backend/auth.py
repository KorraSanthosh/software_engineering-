"""
Authentication module — JWT tokens, password hashing, and user management.
"""
from __future__ import annotations

import datetime as dt
import os
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

import db as store

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SECRET_KEY = os.getenv("JWT_SECRET", "newspaper-agency-super-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("TOKEN_EXPIRE_HOURS", "24"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------
def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = dt.datetime.utcnow() + dt.timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------
async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    """Extract and validate the current user from the JWT token."""
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(token)
    username = payload.get("sub")
    if username is None:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    
    from main import db as main_db
    user = await main_db.Users.find_one({"Username": username})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    
    return store.clean(user)

def require_role(*roles: str):
    """Dependency factory: raises 403 if the user's role is not in the allowed list."""
    async def checker(user: dict = Depends(get_current_user)):
        if user.get("Role") not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {', '.join(roles)}",
            )
        return user
    return checker

# ---------------------------------------------------------------------------
# Seed default accounts
# ---------------------------------------------------------------------------
async def seed_users(db) -> None:
    """Create default accounts if the Users collection is empty."""
    if await db.Users.count_documents({}) > 0:
        return
    
    defaults = []
    defaults.append({
        "UserID": 1,
        "Username": "Manager",
        "PasswordHash": hash_password("6302318692"),
        "Role": "manager",
        "LinkedID": None,
        "DisplayName": "Agency Manager",
        "Phone": "6302318692",
        "CreatedAt": dt.datetime.utcnow()
    })
    
    delivery_persons = await db.Delivery_Persons.find().to_list(100)
    user_id_seq = 2
    for dp in delivery_persons:
        first_name = dp["Name"].split(" ")[0]
        defaults.append({
            "UserID": user_id_seq,
            "Username": first_name,
            "PasswordHash": hash_password(f"{first_name}@123"),
            "Role": "delivery_staff",
            "LinkedID": dp["DeliveryPersonID"],
            "DisplayName": dp["Name"],
            "Phone": str(dp.get("ContactNumber", "9999999999")),
            "CreatedAt": dt.datetime.utcnow()
        })
        user_id_seq += 1
        
    customers = await db.Customers.find().to_list(5)
    for c in customers:
        first_name = c["Name"].split(" ")[0]
        defaults.append({
            "UserID": user_id_seq,
            "Username": first_name,
            "PasswordHash": hash_password(f"{first_name}@123"),
            "Role": "customer",
            "LinkedID": c["CustomerID"],
            "DisplayName": c["Name"],
            "Phone": "9999999999",
            "CreatedAt": dt.datetime.utcnow()
        })
        user_id_seq += 1
        
    await db.Users.insert_many(defaults)
    await db.Users.create_index("Username", unique=True)
    await db.Users.create_index("UserID", unique=True)
    await db.Counters.update_one({"_id": "Users"}, {"$set": {"seq": user_id_seq - 1}}, upsert=True)
    print(f"[auth] Seeded {len(defaults)} dynamic default user accounts")
