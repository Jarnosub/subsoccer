import csv
from io import StringIO
from collections import Counter

data = """Timestamp,EventType,UserType,Score/Details,Location
2026-04-19T14:22:27.057Z,tournament_finished,guest,2p,Europe/Copenhagen
2026-04-19T14:22:27.000Z,tournament_finished,guest,2p,Europe/Copenhagen
2026-04-19T14:19:11.508Z,tournament_finished,guest,2p,Europe/Copenhagen
2026-04-19T14:18:21.009Z,tournament_finished,guest,2p,Europe/Copenhagen
2026-04-19T14:14:23.226Z,game_finished,social,2-3,Europe/Copenhagen
2026-04-19T14:12:33.369Z,app_opened,social,-,Europe/Copenhagen
2026-04-19T13:00:16.696Z,tournament_finished,registered,8p,Europe/Helsinki
2026-04-19T12:37:49.037Z,app_opened,social,-,Europe/London
2026-04-19T11:46:44.088Z,game_finished,social,2-3,Europe/London
2026-04-19T11:40:00.450Z,app_opened,social,-,Europe/London
2026-04-19T11:39:38.587Z,game_finished,social,0-3,Europe/London
2026-04-19T11:37:35.902Z,app_opened,social,-,Europe/London
2026-04-19T11:36:49.596Z,game_finished,social,2-3,Europe/London
2026-04-19T11:34:55.678Z,app_opened,social,-,Europe/London
2026-04-19T11:34:45.360Z,game_finished,social,3-0,Europe/London
2026-04-19T11:34:37.597Z,app_opened,social,-,Europe/London
2026-04-19T11:18:23.133Z,app_opened,social,-,Asia/Baku
2026-04-19T11:01:00.024Z,app_opened,social,-,Europe/Berlin
2026-04-19T10:55:06.355Z,app_opened,social,-,Asia/Manila
2026-04-19T10:50:29.757Z,app_opened,social,-,Asia/Singapore
2026-04-19T10:22:29.445Z,app_opened,social,-,Asia/Singapore
2026-04-19T09:54:44.729Z,tournament_finished,registered,2p,Europe/Helsinki
2026-04-19T09:49:33.565Z,tournament_finished,guest,2p,Europe/London
2026-04-19T09:49:17.570Z,game_finished,social,3-0,Europe/London
2026-04-19T09:49:01.667Z,app_opened,social,-,Europe/London
2026-04-19T09:48:55.076Z,app_opened,social,-,Asia/Jakarta
2026-04-19T09:46:04.330Z,app_opened,social,-,Asia/Manila
2026-04-19T09:16:07.792Z,app_opened,social,-,Asia/Manila
2026-04-19T09:07:52.646Z,app_opened,costco,-,Europe/Helsinki
2026-04-19T09:07:49.515Z,game_finished,costco,0-3,Europe/Helsinki
2026-04-19T09:07:44.915Z,app_opened,costco,-,Europe/Helsinki
2026-04-19T09:06:55.589Z,game_finished,social,3-0,Europe/Helsinki
2026-04-19T09:06:47.351Z,app_opened,social,-,Europe/Helsinki
2026-04-19T08:58:27.480Z,game_finished,social,3-0,Europe/Helsinki
2026-04-19T08:58:22.590Z,app_opened,social,-,Europe/Helsinki
2026-04-19T08:58:07.969Z,app_opened,costco,-,Europe/Helsinki
2026-04-19T08:57:47.740Z,game_finished,costco,0-3,Europe/Helsinki
2026-04-19T08:57:43.805Z,app_opened,costco,-,Europe/Helsinki
2026-04-19T08:53:27.209Z,tournament_finished,registered,4p,Europe/Helsinki
2026-04-19T08:23:25.853Z,tournament_finished,registered,2p,Europe/Helsinki
2026-04-19T08:21:45.505Z,tournament_finished,registered,4p,Europe/Helsinki
2026-04-19T08:12:07.144Z,app_opened,social,-,Asia/Manila
2026-04-19T08:11:45.463Z,game_finished,social,2-3,Asia/Manila
2026-04-19T08:11:38.991Z,game_finished,social,3-1,Asia/Manila
2026-04-19T08:11:22.874Z,app_opened,social,-,Asia/Manila
2026-04-19T07:30:01.564Z,tournament_finished,registered,4p,Europe/Helsinki
2026-04-19T07:26:02.870Z,tournament_finished,registered,2p,Europe/Helsinki
2026-04-19T07:25:49.348Z,tournament_finished,registered,2p,Europe/Helsinki
2026-04-19T07:18:53.060Z,tournament_finished,registered,4p,Europe/Helsinki
2026-04-19T07:10:27.198Z,tournament_finished,guest,2p,Europe/Helsinki
2026-04-19T07:00:38.543Z,app_opened,social,-,Asia/Jakarta
2026-04-19T07:00:26.184Z,game_finished,social,0-3,Asia/Singapore
2026-04-19T06:59:19.971Z,app_opened,social,-,Asia/Singapore
2026-04-19T06:59:03.441Z,game_finished,social,0-3,Asia/Singapore
2026-04-19T06:57:12.493Z,app_opened,social,-,Asia/Singapore
2026-04-19T06:42:54.099Z,app_opened,costco,-,Europe/Helsinki
2026-04-19T06:42:52.093Z,game_finished,costco,0-3,Europe/Helsinki
2026-04-19T06:42:46.922Z,app_opened,costco,-,Europe/Helsinki
2026-04-19T05:20:47.711Z,game_finished,social,3-1,Asia/Singapore
2026-04-19T05:18:08.200Z,game_finished,social,3-2,Asia/Singapore
2026-04-19T05:15:24.469Z,game_finished,social,3-0,Asia/Singapore
2026-04-19T05:13:51.321Z,game_finished,social,3-2,Asia/Singapore
2026-04-19T05:11:44.310Z,game_finished,social,2-3,Asia/Singapore
2026-04-19T05:09:17.158Z,app_opened,social,-,Asia/Singapore
2026-04-19T05:02:51.221Z,game_finished,social,3-1,Asia/Manila
2026-04-19T05:02:32.750Z,app_opened,social,-,Asia/Manila
2026-04-19T05:01:55.062Z,game_finished,social,3-2,Asia/Manila
2026-04-19T05:00:39.130Z,app_opened,social,-,Asia/Manila
2026-04-19T04:42:12.260Z,game_finished,social,2-3,Asia/Singapore
2026-04-19T04:42:01.699Z,app_opened,social,-,Asia/Singapore
2026-04-19T03:56:53.845Z,tournament_finished,guest,8p,Europe/Helsinki
2026-04-19T03:43:36.530Z,app_opened,social,-,Asia/Singapore
2026-04-19T03:43:29.862Z,app_opened,social,-,America/Denver
2026-04-19T03:10:43.588Z,game_finished,social,2-3,America/Denver
2026-04-19T03:08:32.228Z,game_finished,social,0-3,America/Denver
2026-04-19T03:07:27.409Z,game_finished,social,3-0,America/Denver
2026-04-19T03:06:03.842Z,game_finished,social,3-2,America/Denver
2026-04-19T03:03:03.243Z,game_finished,social,3-2,America/Denver
2026-04-19T03:02:45.728Z,app_opened,social,-,America/Denver
2026-04-19T03:02:38.295Z,app_opened,social,-,America/Denver
2026-04-19T02:05:26.143Z,app_opened,social,-,America/Denver
2026-04-19T00:51:28.058Z,app_opened,social,-,America/New_York
"""

reader = csv.DictReader(StringIO(data.strip()))
day_events = []
for row in reader:
    if row['Timestamp'].startswith('2026-04-19'):
        day_events.append(row)

print("Total events today:", len(day_events))

event_counts = Counter(e['EventType'] for e in day_events)
user_counts = Counter(e['UserType'] for e in day_events)
locations = Counter(e['Location'] for e in day_events)

print("\nBy Event Type:")
for k, v in event_counts.items(): print(f"  {k}: {v}")

print("\nBy User Type:")
for k, v in user_counts.items(): print(f"  {k}: {v}")

print("\nBy Location:")
for k, v in locations.items(): print(f"  {k}: {v}")

