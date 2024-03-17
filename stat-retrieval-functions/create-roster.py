import subprocess
import json, os, time


def call_js_function(func_name, *args):
    cmd = ['node', 'player-stat-functions.js', func_name] + list(args)
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        # Log the full output for debugging
        # print("STDOUT:", result.stdout)
        # print("STDERR:", result.stderr)

        # Extract the last line of stdout assuming it's JSON
        json_output = result.stdout.strip().split('\n')[-1]

        # Parse the extracted JSON string
        return json.loads(json_output)

    except subprocess.CalledProcessError as e:
        print(f"Error calling JS function: {e.stderr}")
        print(f"Output before error: {e.output}")
        return None


def create_roster_object(teamID, year, week, period):
    # Initialize teamStats with default values to avoid KeyError
    teamStats = {
        'division': '',
        'win_percentage': 0,
        'strength_of_record': 0,
        'points_per_game': 0,
        'points_allowed_per_game': 0,
        'total_YPG': 0,
        'turnovers_per_game': 0,
        'penalties_per_game': 0,
        '3rd_down_eff': 0,
        'redzone_eff': 0,
        'sacks_per_game': 0,
        'interceptions_per_game': 0,
        'forced_fumbles_per_game': 0,
        'yards_per_play': 0,
        'yards_allowed_per_game': 0,
        'yards_allowed_per_play': 0,
        'FBS_opponent_ratio': 0,
        'QB': [],
        'RBs': [],
        'WRs/TEs': [],
        'Defenders': [],
        'OLs': []
    }

    # Attempt to get team stats for the period
    team_stats_for_period = call_js_function('getTeamStatsForPeriod', teamID, year, week, period)
    if team_stats_for_period:
        # Update teamStats with actual values if available
        teamStats.update({
            'division': team_stats_for_period.get('Division', ''),
            'win_percentage': team_stats_for_period.get('WinPercentage', 0),
            'strength_of_record': call_js_function('getSORForTeam', teamID, year, week, period),
            'points_per_game': team_stats_for_period.get('AveragePointsPerGame', 0),
            'points_allowed_per_game': team_stats_for_period.get('AveragePointsAllowedPerGame', 0),
            'total_YPG': team_stats_for_period.get('AverageYardsPerGame', 0),
            'turnovers_per_game': team_stats_for_period.get('AverageTurnoversPerGame', 0),
            'penalties_per_game': team_stats_for_period.get('AveragePenaltiesPerGame', 0),
            '3rd_down_eff': team_stats_for_period.get('ThirdDownEfficiency', 0),
            'redzone_eff': team_stats_for_period.get('RedZoneEfficiency', 0),
            'sacks_per_game': team_stats_for_period.get('AverageSacksPerGame', 0),
            'interceptions_per_game': team_stats_for_period.get('AverageInterceptionsPerGame', 0),
            'forced_fumbles_per_game': team_stats_for_period.get('AverageForcedFumblesPerGame', 0),
            'yards_per_play': team_stats_for_period.get('YardsPerPlay', 0),
            'yards_allowed_per_game': team_stats_for_period.get('OpponentYardsPerGame', 0),
            'yards_allowed_per_play': team_stats_for_period.get('OpponentYardsPerPlay', 0),
            'FBS_opponent_ratio': team_stats_for_period.get('FCSFBSRatio', 0),
        })

    player_ids = call_js_function('getTeamRosterForSeason', teamID, year, period)
    # Attempt to get player stats for the period
    player_stats = call_js_function('getPlayerStatsForPeriod', player_ids, year, week, period)
    if player_stats:
        # Process player stats to determine starters
        qb_stats, rb_stats, wr_stats, def_stats, ol_stats = process_player_stats(player_stats)
        teamStats['QB'] = qb_stats
        teamStats['RBs'] = rb_stats
        teamStats['WRs/TEs'] = wr_stats
        teamStats['Defenders'] = def_stats
        teamStats['OLs'] = ol_stats

    return teamStats


def calculate_completion_percentage(passing_completions, passing_attempts):
    if passing_attempts > 0:
        return (passing_completions / passing_attempts)
    else:
        return 0


def calculate_qbr(passing_attempts_per_game, passing_completions_per_game, passing_yards_per_game, passing_touchdowns_per_game, interceptions_per_game):
    # Assuming one game for simplicity in calculation
    attempts = passing_attempts_per_game
    completions = passing_completions_per_game
    yards = passing_yards_per_game
    touchdowns = passing_touchdowns_per_game
    interceptions = interceptions_per_game

    if attempts > 0:
        a = ((completions / attempts) - 0.3) * 5
        b = ((yards / attempts) - 3) * 0.25
        c = (touchdowns / attempts) * 20
        d = 2.375 - ((interceptions / attempts) * 25)

        # Ensure the values of a, b, c, and d are between 0 and 2.375
        a = max(0, min(a, 2.375))
        b = max(0, min(b, 2.375))
        c = max(0, min(c, 2.375))
        d = max(0, min(d, 2.375))

        qbr = ((a + b + c + d) / 6) * 100
        return qbr
    else:
        return 0  # Return 0 if no passing attempts to avoid division by zero


def calculate_ratio(td, interceptions):
    interceptions = interceptions or 0.05  # Avoid division by zero, use a small epsilon
    return (td or 0) / interceptions


def calculate_receiving_yards_per_catch(player):
    receiving_yards = player.get('ReceivingYardsPerGame', 0) or 0
    receptions = player.get('ReceptionsPerGame', 0) or 0
    return receiving_yards / max(1, receptions)  # Avoid division by zero


def process_player_stats(player_stats):
    qb_stats, rb_stats, wr_stats, def_stats, ol_stats = [], [], [], [], []

    for player in player_stats:
        player_index = player_stats.index(player)
        # Initialize common stats
        player_data = {
            'player_id': player['PlayerID'],
            'fumbles_per_game': player.get('FumblesPerGame', 0),
            'recruiting_score': player.get('RecruitingScore', 0),
            'period_completed': player.get('PeriodCompleted', False),
        }

        if player_stats.index(player) == 0:
            player_data.update({
                'completion_percentage': calculate_completion_percentage(player.get('PassingCompletionsPerGame', 0), player.get('PassingAttemptsPerGame', 0)),
                'passing_yards_per_game': player.get('PassingYardsPerGame', 0) or 0,
                'TD_INT_ratio': calculate_ratio(player.get('PassingTouchdownsPerGame', 0), player.get('PassingInterceptionsPerGame', 0)),
                'QBR': calculate_qbr(player.get('PassingAttemptsPerGame', 0), player.get('PassingCompletionsPerGame', 0), player.get('PassingYardsPerGame', 0), player.get('PassingTouchdownsPerGame', 0), player.get('PassingInterceptionsPerGame', 0)),
                'rushing_yards': player.get('RushingYardsPerGame', 0) or 0,
                'rushing_touchdowns': player.get('RushingTouchdownsPerGame', 0) or 0,
                'passing_touchdowns': player.get('PassingTouchdownsPerGame', 0) or 0,
            })
            qb_stats.append(player_data)

        elif player_stats.index(player) < 12:  # RB and WR stats
            receptions_per_game = player.get('ReceptionsPerGame', 0) or 0
            player_data.update({
                'rushing_yards_per_game': player.get('RushingYardsPerGame', 0) or 0,
                'rushing_yards_per_carry': player.get('RushingYardsPerCarry', 0) or 0,
                'rushing_touchdowns_per_game': player.get('RushingTouchdownsPerGame', 0) or 0,
                'receiving_touchdowns_per_game': player.get('ReceivingTouchdownsPerGame', 0) or 0,
                'receptions_per_game': receptions_per_game,
                'receiving_yards_per_game': player.get('ReceivingYardsPerGame', 0) or 0,
                'receiving_yards_per_catch': calculate_receiving_yards_per_catch(player),
            })

            if player_stats.index(player) < 5:
                rb_stats.append(player_data)
            else:
                wr_stats.append(player_data)

        elif player_stats.index(player) < 24:
            player_data.update({
                'tackles_per_game': player.get('TacklesPerGame', 0),
                'sacks_per_game': player.get('SacksPerGame', 0),
                'interceptions_per_game': player.get('InterceptionsPerGame', 0),
                'forced_fumbles_per_game': player.get('ForcedFumblesPerGame', 0),
                'passes_defended_per_game': player.get('PassesDefendedPerGame', 0),
            })
            def_stats.append(player_data)
        else:
            ol_stats.append(player_data)

    # Sort and select top players for each position group based on your criteria
    # qb_stats = sorted(qb_stats, key=lambda x: x['passing_yards_per_game'], reverse=True)[:1]
    # rb_stats = sorted(rb_stats, key=lambda x: x['rushing_yards_per_game'], reverse=True)[:4]
    # wr_stats = sorted(wr_stats, key=lambda x: x['receiving_yards_per_game'], reverse=True)[:7]
    # def_stats = sorted(def_stats, key=lambda x: x['tackles_per_game'], reverse=True)[:12]

    return qb_stats, rb_stats, wr_stats, def_stats, ol_stats


def print_roster_stats(team_stats):
    print("Team Performance Stats:")
    print(f"  Division: {team_stats['division']}")
    print(f"  Win Percentage: {team_stats['win_percentage']:.2f}")
    print(f"  Strength of Record: {team_stats['strength_of_record']:.2f}")
    print(f"  Penalties Per Game: {team_stats['penalties_per_game']}")
    print(f"  FBS Opponent Ratio: {team_stats['FBS_opponent_ratio']}")

    print("\nOffensive Stats:")
    print(f"  Total YPG: {team_stats['total_YPG']}")
    print(f"  3rd Down Efficiency: {team_stats['3rd_down_eff']:.2f}")
    print(f"  Redzone Efficiency: {team_stats['redzone_eff']:.2f}")
    print(f"  Turnovers Per Game: {team_stats['turnovers_per_game']}")
    print(f"  Yards Per Play: {team_stats['yards_per_play']}")
    print(f"  Points Per Game: {team_stats['points_per_game']}")

    print("\nDefensive Stats:")
    print(f"  Points Allowed Per Game: {team_stats['points_allowed_per_game']}")
    print(f"  Yards Allowed Per Game: {team_stats['yards_allowed_per_game']}")
    print(f"  Yards Allowed Per Play: {team_stats['yards_allowed_per_play']}")
    print(f"  Interceptions Per Game: {team_stats['interceptions_per_game']}")
    print(f"  Forced Fumbles Per Game: {team_stats['forced_fumbles_per_game']}")
    print(f"  Sacks Per Game: {team_stats['sacks_per_game']}")

    print("\nQuarterback Stats:")
    print_stats_for_position(team_stats['QB'], "QB")

    print("\nRunning Backs Stats:")
    print_stats_for_position(team_stats['RBs'], "RB")

    print("\nWide Receivers / Tight Ends Stats:")
    print_stats_for_position(team_stats['WRs/TEs'], "WR/TE")

    print("\nDefenders Stats:")
    print_stats_for_position(team_stats['Defenders'], "Defender")


def print_stats_for_position(player_stats_list, position_label):
    print(f"{position_label} Stats:")
    for player_stats in player_stats_list:  # Iterate over each player in the list
        print(f"  Player ID: {player_stats.get('player_id', 'N/A')}")
        for key, value in player_stats.items():
            if key != 'player_id':  # Skip printing the player ID again
                if isinstance(value, float):
                    print(f"    {key}: {value:.2f}")
                else:
                    print(f"    {key}: {value}")
        print()  # Print a newline for better readability between players


total_execution_time = 0
execution_count = 0

def create_full_team_objects(gameID):
    global total_execution_time, execution_count  # Use the global variables

    start_time = time.time()  # Start timing

    try:
        json_output_start_time = time.time()
        json_output = call_js_function('getMatchupInfo', gameID)
        print(f"Call to getMatchupInfo took {time.time() - json_output_start_time} seconds.")

        if json_output:
            matchup_info = json.loads(json_output)
            home_team_ID = matchup_info['HomeTeamID']
            away_team_ID = matchup_info['AwayTeamID']
            week = str(matchup_info['Week'])
            season = str(matchup_info['Season'])

            home_stats = []
            away_stats = []

            away_periods = ['season', 'last3Games', 'last3GamesAway', 'lastSeason', 'seasonAway']

            for period in away_periods:
                period_start_time = time.time()
                result = create_roster_object(away_team_ID, season, week, period)
                print(f"Processing away period {period} took {time.time() - period_start_time} seconds.")

                if result is not None:
                    result['period'] = period
                    away_stats.append(result)
                else:
                    print(f"No data for away team in period: {period}")

            home_periods = ['season', 'last3Games', 'last3GamesHome', 'lastSeason', 'seasonHome']

            for period in home_periods:
                period_start_time = time.time()
                result = create_roster_object(home_team_ID, season, week, period)
                print(f"Processing home period {period} took {time.time() - period_start_time} seconds.")

                if result is not None:
                    result['period'] = period
                    home_stats.append(result)
                else:
                    print(f"No data for home team in period: {period}")

            # At the end, before returning:
            execution_time = time.time() - start_time
            total_execution_time += execution_time  # Accumulate total execution time
            execution_count += 1  # Increment execution count

            print(f"Total execution time for create_full_team_objects: {execution_time} seconds.")

            return home_stats, away_stats

        else:
            print("No data returned from getMatchupInfo function.")
    except json.decoder.JSONDecodeError as e:
        print(f"Failed to decode JSON from getMatchupInfo function: {e}")
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        if execution_count > 0:
            average_execution_time = total_execution_time / execution_count
            print(f"Average execution time after {execution_count} executions: {average_execution_time} seconds.")


def print_full_team_objects(gameID):
    # First, create the full team objects using the provided game ID
    home_stats, away_stats = create_full_team_objects(gameID)

    def print_team_stats(team_stats, team_type):
        print(f"\n{team_type} Team Stats:")
        for period_stats in team_stats:
            print(f"\nStats for {period_stats['period']} period:")
            # General team stats
            print_general_team_stats(period_stats)

            # QB Stats
            print_position_stats(period_stats['QB'], "QB")

            # RB Stats
            print_position_stats(period_stats['RBs'], "RB")

            # WR/TE Stats
            print_position_stats(period_stats['WRs/TEs'], "WR/TE")

            # Defender Stats
            print_position_stats(period_stats['Defenders'], "Defender")

            # OL Stats
            print_position_stats(period_stats['OLs'], "OL")

            # Helper function to print stats for a position
    def print_position_stats(position_stats, position_label):
        print(f"\n  {position_label} Stats:")
        for stat in position_stats:
            print(f"    Player ID: {stat['player_id']}")
            for key, value in stat.items():
                if key != 'player_id':  # Skip printing the player ID again
                    formatted_value = format_value(value)
                    print(f"    {key.replace('_', ' ').capitalize()}: {formatted_value}")

    # Function to format value, handling NoneType gracefully
    def format_value(value):
        if value is None:
            return 'N/A'  # Or return '0.00' if you prefer to show 0 for None values
        elif isinstance(value, float):
            return f"{value:.4f}"
        else:
            return value

    def print_general_team_stats(stats):
        print(f"  Division: {stats['division']}")
        print(f"  Win Percentage: {stats['win_percentage']:.2f}")
        print(f"  Strength of Record: {stats['strength_of_record']:.2f}")
        print(f"  Points Per Game: {stats['points_per_game']}")
        print(f"  Points Allowed Per Game: {stats['points_allowed_per_game']}")
        print(f"  Total Yards Per Game: {stats['total_YPG']}")
        print(f"  Turnovers Per Game: {stats['turnovers_per_game']}")
        print(f"  Penalties Per Game: {stats['penalties_per_game']}")
        print(f"  3rd Down Efficiency: {stats['3rd_down_eff']}")
        print(f"  Redzone Efficiency: {stats['redzone_eff']}")
        print(f"  Sacks Per Game: {stats['sacks_per_game']}")
        print(f"  Interceptions Per Game: {stats['interceptions_per_game']}")
        print(f"  Forced Fumbles Per Game: {stats['forced_fumbles_per_game']}")
        print(f"  Yards Per Play: {stats['yards_per_play']}")
        print(f"  Yards Allowed Per Game: {stats['yards_allowed_per_game']}")
        print(f"  Yards Allowed Per Play: {stats['yards_allowed_per_play']}")
        print(f"  FBS Opponent Ratio: {stats['FBS_opponent_ratio']}")


    print_team_stats(home_stats, "Home")
    print_team_stats(away_stats, "Away")


# print_full_team_objects('0001ce86-7c8a-4412-be88-1a5eaf40b981')

def replace_none_with_negative_one(data):
    if isinstance(data, dict):
        for k, v in data.items():
            if v is None:
                data[k] = 0
            elif isinstance(v, (dict, list)):
                replace_none_with_negative_one(v)
    elif isinstance(data, list):
        for i in range(len(data)):
            if data[i] is None:
                data[i] = 0
            elif isinstance(data[i], (dict, list)):
                replace_none_with_negative_one(data[i])


def fetch_team_stats(gameID):
    home_stats, away_stats = create_full_team_objects(gameID)
    # Recursively replace None values with 0
    replace_none_with_negative_one(home_stats)
    replace_none_with_negative_one(away_stats)
    return home_stats, away_stats


def load_existing_data(filename):
    """Load existing data from the JSON file, if it exists."""
    if os.path.exists(filename):
        with open(filename, 'r') as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return []  # Return an empty list if the file is empty or corrupted
    return []

def append_to_json(data, filename='game_stats_for_dnn.json'):
    """Append data to an existing JSON file, creating a new file if it doesn't exist."""
    existing_data = load_existing_data(filename)
    existing_game_ids = {game['GameID'] for game in existing_data}

    # Check if the game is already in the existing data
    if data['GameID'] not in existing_game_ids:
        existing_data.append(data)

    with open(filename, 'w') as f:
        json.dump(existing_data, f, indent=4)

def main(schedule_json_path='schedule.json', output_json_path='game_stats_for_dnn.json'):
    with open(schedule_json_path, 'r') as f:
        schedule = json.load(f)

    existing_data = load_existing_data(output_json_path)
    existing_game_ids = {game['GameID'] for game in existing_data}

    for game in schedule:
        gameID = game['GameID']
        if gameID not in existing_game_ids:
            print(f"Processing game {gameID}")
            try:
                home_stats, away_stats = fetch_team_stats(gameID)
                if home_stats is None or away_stats is None:  # Check if either is None
                    print(f"Skipping game {gameID} due to missing stats.")
                    continue  # Skip this game
            except TypeError:  # Handle the case where fetch_team_stats returns None
                print(f"Skipping game {gameID} due to an error fetching stats.")
                continue

            structured_data = structure_data_for_dnn(game, home_stats, away_stats)
            append_to_json(structured_data, output_json_path)
            print('Finished game:', gameID)


def structure_data_for_dnn(game, home_stats, away_stats):
    # Structure a single game data for DNN
    return {
        'GameID': game['GameID'],
        'Season': game['Season'],
        'Week': game['Week'],
        'HomePoints': game['HomePoints'],
        'AwayPoints': game['AwayPoints'],
        'HomeStats': home_stats,
        'AwayStats': away_stats
    }

main()