import subprocess
import json


def call_js_function(func_name, *args):
    cmd = ['node', 'player-stat-functions.js', func_name] + list(args)
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        # Extract the last line of stdout assuming it's JSON
        json_output = result.stdout.strip().split('\n')[-1]

        # Parse the extracted JSON string
        return json.loads(json_output)

    except subprocess.CalledProcessError as e:
        print(f"Error calling JS function: {e.stderr}")
        print(f"Output before error: {e.output}")
        return None


def create_roster_object(teamID, year, week, period):
    # Get team stats directly for the period
    team_stats_for_period = call_js_function('getTeamStatsForPeriod', teamID, year, week, period)
    player_stats = call_js_function('getPlayerStatsForPeriod', teamID, year, week, period)

    # Process player stats to determine starters
    qb_stats, rb_stats, wr_stats, def_stats = process_player_stats(player_stats)

    # Populate teamStats with both team and individual stats
    teamStats = {
        'division': team_stats_for_period['Division'],
        'win_percentage': team_stats_for_period['WinPercentage'],
        'strength_of_record': call_js_function('getSORForTeam', teamID, year, week, period),
        'points_per_game': team_stats_for_period['AveragePointsPerGame'],
        'points_allowed_per_game': team_stats_for_period['AveragePointsAllowedPerGame'],
        'total_YPG': team_stats_for_period['AverageYardsPerGame'],
        'turnovers_per_game': team_stats_for_period['AverageTurnoversPerGame'],
        'penalties_per_game': team_stats_for_period['AveragePenaltiesPerGame'],
        '3rd_down_eff': team_stats_for_period['ThirdDownEfficiency'],
        'redzone_eff': team_stats_for_period['RedZoneEfficiency'],
        'sacks_per_game': team_stats_for_period['AverageSacksPerGame'],
        'interceptions_per_game': team_stats_for_period['AverageInterceptionsPerGame'],
        'forced_fumbles_per_game': team_stats_for_period['AverageForcedFumblesPerGame'],
        'yards_per_play': team_stats_for_period['YardsPerPlay'],
        'yards_allowed_per_game': team_stats_for_period['OpponentYardsPerGame'],
        'yards_allowed_per_play': team_stats_for_period['OpponentYardsPerPlay'],
        'FBS_opponent_ratio': team_stats_for_period['FCSFBSRatio'],
        'QB': qb_stats,
        'RBs': rb_stats,
        'WRs/TEs': wr_stats,
        'Defenders': def_stats,
    }

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


def process_player_stats(player_stats):
    qb_stats, rb_stats, wr_stats, def_stats = [], [], [], []

    for player in player_stats:
        # Initialize common stats
        player_data = {
            'player_id': player['PlayerID'],
            'fumbles_per_game': player.get('FumblesPerGame', 0),
            'recruiting_score': player.get('RecruitingScore', 0),
        }

        if player['Position'] == 'QB':
            player_data.update({
                'completion_percentage': calculate_completion_percentage(player.get('PassingCompletionsPerGame', 0), player.get('PassingAttemptsPerGame', 0)),
                'passing_yards_per_game': player.get('PassingYardsPerGame', 0),
                'TD_INT_ratio': player.get('PassingTouchdownsPerGame', 0) / max(0.05,player.get('PassingInterceptionsPerGame')),  # Avoid division by zero
                'QBR': calculate_qbr(player.get('PassingAttemptsPerGame', 0), player.get('PassingCompletionsPerGame', 0), player.get('PassingYardsPerGame', 0), player.get('PassingTouchdownsPerGame', 0), player.get('PassingInterceptionsPerGame', 0)),
                'rushing_yards': player.get('RushingYardsPerGame', 0),
                'rushing_touchdowns': player.get('RushingTouchdownsPerGame', 0),
                'passing_touchdowns': player.get('PassingTouchdownsPerGame', 0),
            })
            qb_stats.append(player_data)

        elif player['Position'] in ['RB', 'FB', 'WR', 'TE']:
            player_data.update({
                'rushing_yards_per_game': player.get('RushingYardsPerGame', 0),
                'rushing_yards_per_carry': player.get('RushingYardsPerCarry', 0),
                'rushing_touchdowns_per_game': player.get('RushingTouchdownsPerGame', 0),
                'receiving_touchdowns_per_game': player.get('ReceivingTouchdownsPerGame', 0),
                'receptions_per_game': player.get('ReceptionsPerGame', 0),
                'receiving_yards_per_game': player.get('ReceivingYardsPerGame', 0),
                'receiving_yards_per_catch': player.get('ReceivingYardsPerGame', 0) / max(1, player.get('ReceptionsPerGame')),  # Avoid division by zero
            })

            if player['Position'] in ['RB', 'FB']:
                rb_stats.append(player_data)
            else:
                wr_stats.append(player_data)

        elif player['Position'] in ['CB', 'DB', 'DE', 'DL', 'DT', 'LB', 'SAF', 'OLB']:
            player_data.update({
                'tackles_per_game': player.get('TacklesPerGame', 0),
                'sacks_per_game': player.get('SacksPerGame', 0),
                'interceptions_per_game': player.get('InterceptionsPerGame', 0),
                'forced_fumbles_per_game': player.get('ForcedFumblesPerGame', 0),
                'passes_defended_per_game': player.get('PassesDefendedPerGame', 0),
            })
            def_stats.append(player_data)

    # Sort and select top players for each position group based on your criteria
    qb_stats = sorted(qb_stats, key=lambda x: x['passing_yards_per_game'], reverse=True)[:1]
    rb_stats = sorted(rb_stats, key=lambda x: x['rushing_yards_per_game'], reverse=True)[:4]
    wr_stats = sorted(wr_stats, key=lambda x: x['receiving_yards_per_game'], reverse=True)[:7]
    def_stats = sorted(def_stats, key=lambda x: x['tackles_per_game'], reverse=True)[:12]

    return qb_stats, rb_stats, wr_stats, def_stats


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



# Example usage:
team_id = '98833e65-ab72-482d-b3c0-13f8656629c0'
year = '2018'
week = '12'
period = 'last3GamesAway'

team_stats = create_roster_object(team_id, year, week, period)
print_roster_stats(team_stats)

