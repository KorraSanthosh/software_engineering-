import asyncio
import motor.motor_asyncio

async def main():
    client = motor.motor_asyncio.AsyncIOMotorClient('mongodb://localhost:27017')
    db = client.newspaper_agency
    await db.Users.drop()
    await db.Counters.delete_one({"_id": "Users"})
    print("Users collection and counter dropped.")

if __name__ == '__main__':
    asyncio.run(main())
