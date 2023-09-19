# passkeys-backend

# Database Structure

## Profiles
- user_id PRIMARY KEY INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
- username TEXT UNIQUE NOT NULL,
- first_name TEXT,
- last_name TEXT
## Transactions
- id SERIAL PRIMARY KEY,
- payer_id INTEGER NOT NULL,
- payee_id INTEGER NOT NULL,
- amount REAL NOT NULL,
- action TEXT NOT NULL,
- status TEXT NOT NULL,
- note TEXT NOT NULL,
- date_created INTEGER NOT NULL,
- date_completed INTEGER,
- audience TEXT NOT NULL

### req.user contents
- id
- username
- name (display name)

# Users Endpoints
## Current user's profile info 🔐
`GET /me`
Params:
- Session cookie
Response Body:
```
{
	"profile": {
		"username": String,
		"firstName": String,
		"lastName": String,
		"displayName": String,
		"relationship": String,
		"friendsCount": Int,
		"id": Int,
		"balance": Double
	}
}
```
## Update profile 🔐
`PUT /me`
Parameters:
- firstName 
- lastName
No response body
## Profile info
`GET /profiles/:userID`
Params:
- none
Response body:
```
{
	"profile": {
		"username": String,
		"firstName": String,
		"lastName": String,
		"displayName": String,
		"relationship": String, // me, none, friend, youRequested, theyRequested
		"friendsCount": Int,
		"id": Int
	}
}
```

## Add/remove friend 🔐
`POST /profiles/:userID`
Params:
- Session cookie
- Relationship (none, friend)
Response body: None?
## User's friends
`GET /profiles/:userID/friends`
Params:
- none
Response body:
```
{
	"friends": [
		{
			"username": String,
			"firstName": String,
			"lastName": String,
			"displayName": String,
			"id": Int
		},
		{...},
		...
	]
}
```
**DEFINITIONS**
- relationship: me, none, friend, user1Requested, user2Requested, unknown (endpoint called without logging in) (TODO: blocked)
	- Note: user1Requested and user2Requested are server-side only (in database). Response will contain either youRequested or theyRequested

## Profile search
`GET /profiles`
Performs search by username.
Params:
- query
- limit (optional)
Response body:
```
{
	"profiles": [
		{...},
		...
	]
}
```
# Transaction Endpoints
## Initiate transaction 🔐
`POST /transactions`
Params:
- Session cookie
- Target id
- Amount
- Action
- Note
- Audience
Response body:
```
{
	"id": Int,
	"balance": Double,
	"amount": Double,
	"action": String,
	"status": String,
	"note": String,
	"dateCreated": Date,
	"dateCompleted": Date,
	"audience": String,
	"actor": {
		"id": Int,
		"username": String,
		"firstName": String,
		"lastName": String,
		"displayName": String,
	},
	"target": {
		"id": Int,
		"username": String,
		"firstName": String,
		"lastName": String,
		"displayName": String,
	}
}
```
## List recent transactions 🔐
`GET /transactions`
Params:
- Session cookie
- Feed (friends, user, betweenUs) (optional, default friends)
- Party id (optional) (only used in user or betweenUs)
- Limit (optional)
- Before (optional)
- After (optional)
- lastTransactionID (optional)
Response body:
```
{
	"pagination": {
		"lastTransactionID": Int // ID of last returned transaction
	},
	"data": [
		{		
			"id": Int,
			"balance": Double,
			"amount": Double,
			"action": String,
			"status": String,
			"note": String,
			"dateCreated": Date,
			"dateCompleted": Date,
			"audience": String,
			"actor": {
				"id": Int,
				"username": String,
				"firstName": String,
				"lastName": String,
				"displayName": String,
			},
			"target": {
				"id": Int,
				"username": String,
				"firstName": String,
				"lastName": String,
				"displayName": String,
			}
		},
		{...},
		...
	]
}
```
*Note: Venmo has removed its global feed for privacy reasons, and so will we.*
## List outstanding transactions 🔐
`GET /transactions/outstanding`
Params:
- Session cookie
- Limit (optional)
- Before (optional)
- After (optional)
- lastTransactionID (optional)
```
{
	"pagination": {
		"lastTransactionID": Int // ID of last returned transaction[[]()]()
	},
	"data": [
		{...},
		...
	]
}
```
## Transaction Information 🔐
`GET /transaction/:transactionID`
Params:
- Session cookie
Response body:
```
{
	"transaction": {...}
}
```
## Complete transaction request 🔐
`PUT /transaction/:transactionID`
Params:
- Session cookie
- Action (approve, deny, cancel if sender)
Response body:
```
{
	"transaction: {...}
}
```
