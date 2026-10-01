import asyncio
import db
import auth

async def main():
    dp = await db.Delivery_Persons.find().to_list(10)
    print("Delivery Staff:", [d.get('Name') for d in dp])
    cust = await db.Customers.find().to_list(10)
    print("Customers:", [c.get('Name') for c in cust])
    
    users = await db.Users.find().to_list(20)
    print("Users created:")
    for u in users:
        print(f" - {u.get('Username')}: {u.get('Phone')} (Role: {u.get('Role')})")

if __name__ == '__main__':
    asyncio.run(main())
