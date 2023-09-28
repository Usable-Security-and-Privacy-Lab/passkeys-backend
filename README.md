# passkeys-backend
Most everything I think you'll need to know/resources you'll need to work on this project.

# Heroku
Deployment to Heroku is done through Git.
## General notes
- **You can only access the Heroku app/use Heroku commands for the app via the CLI if you are in that app's repository/the location where you added the Heroku remote. So typing any app-associated Heroku commands will not work unless you're in that directory.**
## Setup
1. Clone the [passkeys-backend](https://github.com/Usable-Security-and-Privacy-Lab/passkeys-backend) project to your development environment.
2. [Install the Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli#install-the-heroku-cli).
3. Log into the lab Heroku account in the heroku command line interface using `heroku login` (details in the link in step 2).
4. Navigate in the terminal to the folder where you cloned `passkeys-backend` so that you're inside the `passkeys-backend` directory.
5. Enter `heroku git:remote -a passkeys-backend` in the command line to add the Heroku remote to your local repository (see ["For an Existing App" here](https://devcenter.heroku.com/articles/git#for-an-existing-app) for more information/help).
## Deploy to Heroku
- Once you've committed changes to your local repository, type `git push heroku main` in the command line to deploy to the Heroku server.
- Note to also push your commits to the `passkeys-backend` lab repository as well so that your teammates can have your updated code to work on.
## Environment Variables
- Use `heroku config` to see the set environment variables for the app. We have the database URL and the session secret saved as environment variables. If you need to set new ones, you'll need to do your own research on how to do so. Check the Heroku documentation, I think [this](https://devcenter.heroku.com/articles/config-vars) is the page you want.
## Access the Database
- To access the app's database directly, use `heroku pg:psql`. This will connect you to the database associated with the app (assuming you're in)
- Some useful commands:
	- `\dt` - display all tables in the database
	- `TABLE table_name;` - show the contents of a table with name `table_name`
	- Use other SQL commands to view/modify the database as needed (you're on your own). Don't forget semicolons where needed!
	- You may need to type `q` to exit some commands.
	- `ctrl + Z` to exit the database connection.
## View Node/Express app logs
- To view the logs of your running program, including log statements, error statements, etc., use `heroku logs`
- `heroku logs --tail` is particularly useful to stay connected to the log feed during debugging

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
