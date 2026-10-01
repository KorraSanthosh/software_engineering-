import asyncio
import os
import motor.motor_asyncio
from dotenv import load_dotenv

load_dotenv('backend/.env')

async def main():
    client = motor.motor_asyncio.AsyncIOMotorClient(os.environ.get('MONGO_URL'))
    db = client[os.environ.get('MONGO_DB', 'newspaper')]
    dp = await db.Delivery_Persons.find().to_list(10)
    print("Delivery Staff:", [d['Name'] for d in dp])
    cust = await db.Customers.find().to_list(10)
    print("Customers:", [c['Name'] for c in cust])
    users = await db.Users.find().to_list(20)
    print("Users created:")
    for u in users:
        print(f" - {u.get('Username')}: {u.get('Phone')} (Role: {u.get('Role')})")

if __name__ == '__main__':
    asyncio.run(main())
