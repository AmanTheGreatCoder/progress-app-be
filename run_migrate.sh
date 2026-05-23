#!/bin/bash
cd /home/aman/Desktop/progress-app/backend
npx prisma migrate deploy
npx prisma generate
