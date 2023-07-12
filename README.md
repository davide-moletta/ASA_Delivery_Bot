# Autonomous Delivery Agents

Project for the "Autonomous Software Agents" course in UNITN a.y. 2022-2023 by [me](https://github.com/davidemodolo) and [Davide Moletta](https://github.com/davide-moletta).

## Project in brief

This project aimed to develop an autonomous software agent able to play the web game Deliveroo.js. The agent follows a BDI architecture to sense the environment and manage its beliefs and intentions. The objective of the agent is to maximize the points that it can earn by picking up and delivering parcels in the game.

We explored three main approaches: single-agent, multi-agent with a sliced map and multi-agent with intention sharing.

Finally, we made several tests, analyzed results and performances (using the provided challenges), compared the different approaches, and examined possible future implementations.

## Repository content
```
project
│   README.md
│   .gitignore
│   ModoloMoletta.pdf: report for this project
│
└───Agent: our code for the single-agent and multi-agent approaches
|     |
|     └─── Single Agent PDDL A
|     |
|     └─── Multi Agent PDDL B1 & C1: basic multi agent implementation
|     |
|     └─── Multi Agent PDDL B2 & C2: medium multi agent implementation
│       
└───CustomServer: edit of the DefaultServer to test our code in a controlled environment

```
