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
    team_roster = call_js_function('getTeamRosterForSeason', teamID, year)

    qb_id = team_roster['Quarterbacks'][0]['PlayerID']
    rb_ids = [team_roster['RunningBacks'][0]['PlayerID'], team_roster['RunningBacks'][1]['PlayerID'], team_roster['RunningBacks'][2]['PlayerID'], team_roster['RunningBacks'][3]['PlayerID'],]
    wr_ids = [team_roster['Receivers'][0]['PlayerID'], team_roster['Receivers'][1]['PlayerID'], team_roster['Receivers'][2]['PlayerID'], team_roster['Receivers'][3]['PlayerID'], team_roster['Receivers'][4]['PlayerID'], team_roster['Receivers'][5]['PlayerID'], team_roster['Receivers'][6]['PlayerID']]
    def_ids = [team_roster['Defenders'][0]['PlayerID'], team_roster['Defenders'][1]['PlayerID'], team_roster['Defenders'][2]['PlayerID'], team_roster['Defenders'][3]['PlayerID'], team_roster['Defenders'][4]['PlayerID'], team_roster['Defenders'][5]['PlayerID'], team_roster['Defenders'][6]['PlayerID'], team_roster['Defenders'][7]['PlayerID'], team_roster['Defenders'][8]['PlayerID'], team_roster['Defenders'][9]['PlayerID'], team_roster['Defenders'][10]['PlayerID'], team_roster['Defenders'][11]['PlayerID']]

    rb_stats = []
    wr_stats = []
    def_stats = []

    # Get team stats directly for the period
    team_stats_for_period = call_js_function('getTeamStatsForPeriod', teamID, year, week, period)
    if not team_stats_for_period:
        print("Failed to retrieve team stats")
        return None

    for id in rb_ids:
        rb_stat = {
            'rushing_yards_per_game': call_js_function('getRushingYardsPerGame', id, year, week, period),
            'rushing_yards_per_carry': call_js_function('getYardsPerCarry', id, year, week, period),
            'rushing_touchdowns_per_game': call_js_function('getRushingTDsPerGame', id, year, week, period),
            'fumbles_per_game': call_js_function('getFumblesPerGame', id, year, week, period),
            'receiving_touchdowns_per_game': call_js_function('getReceivingTDsPerGame', id, year, week, period),
            'receptions_per_game': call_js_function('getReceptionsPerGame', id, year, week, period),
            'receiving_yards_per_game': call_js_function('getReceivingYardsPerGame', id, year, week, period),
            'receiving_yards_per_catch': call_js_function('getReceivingYardsPerCatch', id, year, week, period),
            'recruiting_score': call_js_function('getRecruitingScore', id),
        }
        rb_stats.append(rb_stat)

    for id in wr_ids:
        wr_stat = {
            'rushing_yards_per_game': call_js_function('getRushingYardsPerGame', id, year, week, period),
            'rushing_yards_per_carry': call_js_function('getYardsPerCarry', id, year, week, period),
            'rushing_touchdowns_per_game': call_js_function('getRushingTDsPerGame', id, year, week, period),
            'fumbles_per_game': call_js_function('getFumblesPerGame', id, year, week, period),
            'receiving_touchdowns_per_game': call_js_function('getReceivingTDsPerGame', id, year, week, period),
            'receptions_per_game': call_js_function('getReceptionsPerGame', id, year, week, period),
            'receiving_yards_per_game': call_js_function('getReceivingYardsPerGame', id, year, week, period),
            'receiving_yards_per_catch': call_js_function('getReceivingYardsPerCatch', id, year, week, period),
            'recruiting_score': call_js_function('getRecruitingScore', id),
        }
        wr_stats.append(wr_stat)

    for id in def_ids:
        def_stat = {
            'tackles_per_game': call_js_function('getTacklesPerGame', id, year, week, period),
            'sacks_per_game': call_js_function('getSacksPerGame', id, year, week, period),
            'interceptions_per_game': call_js_function('getInterceptionsPerGame', id, year, week, period),
            'forced_fumbles_per_game': call_js_function('getForcedFumblesPerGame', id, year, week, period),
            'passes_defended_per_game': call_js_function('getPassesDefendedPerGame', id, year, week, period),
            'recruiting_score': call_js_function('getRecruitingScore', id),
        }
        def_stats.append(def_stat)

    teamStats = {
        'division': team_stats_for_period['Division'],
        'win_percentage': team_stats_for_period['WinPercentage'],
        'strength_of_record': call_js_function('getSORForTeam', teamID, year, week, period),
        'points_per_game': team_stats_for_period['AveragePointsPerGame'],
        'points_allowed_per_game': team_stats_for_period['AveragePointsAllowedPerGame'],
        'total_YPG': team_stats_for_period['AverageYardsPerGame'],
        'turnovers_per_game': team_stats_for_period['AverageTurnoversPerGame'],
        'average_penalties_per_game': team_stats_for_period['AveragePenaltiesPerGame'],
        '3rd_down_eff': team_stats_for_period['ThirdDownEfficiency'],
        'redzone_eff': team_stats_for_period['RedZoneEfficiency'],
        'sacks_per_game': team_stats_for_period['AverageSacksPerGame'],
        'interceptions_per_game': team_stats_for_period['AverageInterceptionsPerGame'],
        'forced_fumbles_per_game': team_stats_for_period['AverageForcedFumblesPerGame'],
        'yards_per_play': team_stats_for_period['YardsPerPlay'],
        'yards_allowed_per_game': team_stats_for_period['OpponentYardsPerGame'],
        'yards_allowed_per_play': team_stats_for_period['OpponentYardsPerPlay'],
        'FBS_opponent_ratio': team_stats_for_period['FCSFBSRatio'],

        # Recruiting Stats
        ## FINISH LATER

        ###########################
        # INDIVIDUAL ROSTER STATS #
        ###########################

        'QB': {
            'completion_percentage': call_js_function('getCompletionPercentage', qb_id, year, week, period),
            'passing_yards_per_game': call_js_function('getPassingYardsPerGame', qb_id, year, week, period),
            'TD_INT_ratio': call_js_function('getTDINTRatio', qb_id, year, week, period),
            'QBR': call_js_function('getQBR', qb_id, year, week, period),
            'rushing_yards': call_js_function('getRushingYardsPerGame', qb_id, year, week, period),
            'rushing_touchdowns': call_js_function('getRushingTDsPerGame', qb_id, year, week, period),
            'passing_touchdowns': call_js_function('getPassingTDsPerGame', qb_id, year, week, period),
            'fumbles_per_game': call_js_function('getFumblesPerGame', qb_id, year, week, period),
            'recruiting_score': call_js_function('getRecruitingScore', qb_id),
        },

        'RBs': rb_stats,
        'WRs/TEs': wr_stats,
        'Defenders': def_stats,
    }

    return teamStats


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
    qb_stats = team_stats['QB']
    print_stats_for_position(qb_stats, "QB")

    print("\nRunning Backs Stats:")
    for rb_stat in team_stats['RBs']:
        print_stats_for_position(rb_stat, "RB")

    print("\nWide Receivers / Tight Ends Stats:")
    for wr_stat in team_stats['WRs/TEs']:
        print_stats_for_position(wr_stat, "WR/TE")

    print("\nDefenders Stats:")
    for def_stat in team_stats['Defenders']:
        print_stats_for_position(def_stat, "Defender")


def print_stats_for_position(player_stats, position_label):
    print(f"  {position_label}:")
    for key, value in player_stats.items():
        if isinstance(value, float):
            print(f"    {key}: {value:.2f}")
        else:
            print(f"    {key}: {value}")


# Example usage:
team_id = '98833e65-ab72-482d-b3c0-13f8656629c0'
year = '2016'
week = '7'
period = 'last3Games'

team_stats = create_roster_object(team_id, year, week, period)
print_roster_stats(team_stats)

