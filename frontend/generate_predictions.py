import json
import numpy as np
import joblib
import statistics
from keras.models import load_model
import glob


def preprocess_data(games, pre_2023_period=True):
    features = []
    labels = []
    feature_names = []

    # Define the structure for stats we are interested in
    team_stats_fields = ['win_percentage', 'strength_of_record', 'points_per_game', 'points_allowed_per_game',
                         'total_YPG', 'turnovers_per_game', 'penalties_per_game', '3rd_down_eff',
                         'redzone_eff', 'sacks_per_game', 'interceptions_per_game', 'forced_fumbles_per_game',
                         'yards_per_play', 'yards_allowed_per_game', 'yards_allowed_per_play', 'FBS_opponent_ratio']
    player_roles = ['QB', 'RBs', 'WRs/TEs', 'Defenders']

    QB_stats_fields = ['fumbles_per_game', 'period_completed', 'completion_percentage', 'passing_yards_per_game',
                       'TD_INT_ratio', 'QBR', 'rushing_yards', 'rushing_touchdowns', 'passing_touchdowns']

    skill_position_stat_fields = ['fumbles_per_game', 'period_completed', 'rushing_yards_per_game',
                                  'rushing_yards_per_carry',
                                  'rushing_touchdowns_per_game', 'receiving_touchdowns_per_game', 'receptions_per_game',
                                  'receiving_yards_per_game', 'receiving_yards_per_catch']

    defender_stat_fields = ['fumbles_per_game', 'period_completed', 'tackles_per_game', 'sacks_per_game',
                            'interceptions_per_game', 'forced_fumbles_per_game', 'passes_defended_per_game']

    max_players = {'QB': 1, 'RBs': 4, 'WRs/TEs': 7, 'Defenders': 12, 'OLs': 5}

    games_passed_checks = 0
    # Process each game
    for game in games:
        if (pre_2023_period and int(game['Season']) < 2023) or (not pre_2023_period and int(game['Season']) >= 2023):
            game_feature = [
                float(game['Season']) - 2014.0,
                float(game['Week']),
                float(game['HomeStats'][0]['division'] == "FBS"),
                float(game['AwayStats'][0]['division'] == "FBS"),
                float(game['HomeAPVotes']),
                float(game['AwayAPVotes']),
                float(game['HomeFCSVotes']),
                float(game['AwayFCSVotes'])
            ]

            if any(len(period.get('QB', [])) == 0 for period in game['HomeStats'] + game['AwayStats']):
                continue

            if any(len(period.get('RBs', [])) == 0 for period in game['HomeStats'] + game['AwayStats']):
                continue

            if any(len(period.get('WRs/TEs', [])) == 0 for period in game['HomeStats'] + game['AwayStats']):
                continue

            if any(len(period.get('OLs', [])) == 0 for period in game['HomeStats'] + game['AwayStats']):
                continue

            games_passed_checks += 1

            home_recruiting_scores = []
            away_recruiting_scores = []

            # Function to extract recruiting scores from players, filling in zeros if needed
            def get_recruiting_scores(players, max_count):
                scores = [float(player.get('recruiting_score', 0)) for player in players[:max_count]]
                scores += [0] * (max_count - len(scores))  # Fill the remaining slots with zeros
                return scores

            # Loop over HomeStats and AwayStats
            for team_key in ['HomeStats', 'AwayStats']:
                # Loop over each position group and retrieve the recruiting scores
                for position, max_count in max_players.items():
                    players = game[team_key][0].get(position, [])
                    recruiting_scores = get_recruiting_scores(players, max_count)
                    game_feature.extend(recruiting_scores)
                    if team_key == 'HomeStats':
                        home_recruiting_scores.extend(recruiting_scores)
                    elif team_key == 'AwayStats':
                        away_recruiting_scores.extend(recruiting_scores)
                    else:
                        print('ERROR!!!! Team key is wrong')

            # Calculate full-team recruiting stats
            home_average_recruit_score = 0
            for score in home_recruiting_scores:
                home_average_recruit_score += score
            home_average_recruit_score = home_average_recruit_score / len(home_recruiting_scores)
            home_bc_ratio = sum(i > 0.9 for i in home_recruiting_scores) / len(home_recruiting_scores)
            home_3_star_ratio = sum(i > 0.8 for i in home_recruiting_scores) / len(home_recruiting_scores)
            home_any_star_ratio = sum(i > 0.1 for i in home_recruiting_scores) / len(home_recruiting_scores)

            away_average_recruit_score = 0
            for score in away_recruiting_scores:
                away_average_recruit_score += score
            away_average_recruit_score = away_average_recruit_score / len(away_recruiting_scores)
            away_bc_ratio = sum(i > 0.9 for i in away_recruiting_scores) / len(away_recruiting_scores)
            away_3_star_ratio = sum(i > 0.8 for i in away_recruiting_scores) / len(away_recruiting_scores)
            away_any_star_ratio = sum(i > 0.1 for i in away_recruiting_scores) / len(away_recruiting_scores)

            game_feature.append(home_average_recruit_score)
            game_feature.append(home_bc_ratio)
            game_feature.append(home_3_star_ratio)
            game_feature.append(home_any_star_ratio)
            game_feature.append(away_average_recruit_score)
            game_feature.append(away_bc_ratio)
            game_feature.append(away_3_star_ratio)
            game_feature.append(away_any_star_ratio)

            # Aggregate stats from all periods
            for period_stats in game['HomeStats'] + game['AwayStats']:
                # Team stats
                for field in team_stats_fields:
                    game_feature.append(float(period_stats.get(field, 0)))
                # Player stats
                for role in player_roles:
                    players = period_stats.get(role, [{}] * max_players[role])
                    for i in range(max_players[role]):
                        player = players[i] if i < len(players) else {}

                        stats_to_use = []
                        if role == 'QB':
                            stats_to_use = QB_stats_fields
                        elif role in ['RBs', 'WRs/TEs']:
                            stats_to_use = skill_position_stat_fields
                        elif role == 'Defenders':
                            stats_to_use = defender_stat_fields
                        else:
                            print("ERROR!!!! ROLE IS " + role)

                        for field in stats_to_use:
                            # Convert period_completed from True/False to 1/0
                            if field == 'period_completed':
                                game_feature.append(float(player.get(field, False) == "True"))
                            else:
                                game_feature.append(float(player.get(field, 0)))

            home_points = float(game['HomePoints'])
            away_points = float(game['AwayPoints'])
            win_label = 1 if home_points > away_points else 0
            features.append(game_feature)
            labels.append([home_points, away_points, win_label])

    print(f"{games_passed_checks} games passed the checks and were processed.")

    X = np.array(features, dtype=float)
    y = np.array(labels, dtype=float)

    return X, y


# Load the scaler
scaler = joblib.load('../stat-retrieval-functions/scaler.save')

# Load the top 5 models
model_files = sorted(glob.glob('../stat-retrieval-functions/best_model_*.h5'))[-5:]
models = [load_model(file) for file in model_files]

with open('../stat-retrieval-functions/full_game_stats_for_dnn_polls.json') as file:
    game_data = json.load(file)

with open('SCHEDULE.json') as file:
    schedule_data = json.load(file)

# Create a dictionary to map GameID to team information
game_info_dict = {game['GameID']: game for game in schedule_data}

predictions_data = {}

for week in range(1, 20):  # Assuming 19 weeks (adjust as needed)
    week_str = str(week)

    # Filter games for the specified week in the 2023 season
    week_games = [game for game in game_data if game['Week'] == week_str and int(game['Season']) >= 2023]

    # Preprocess the game data
    X, _ = preprocess_data(week_games, pre_2023_period=False)

    # Scale the preprocessed features using the scaler
    X_scaled = scaler.transform(X)

    # Make predictions for each game in the week
    predictions = []
    for i, game in enumerate(week_games):
        # Check if the index is within the valid range of X_scaled
        if i >= X_scaled.shape[0]:
            continue

        # Extract the scaled features for the current game
        features = X_scaled[i].reshape(1, -1)

        try:
            # Use the top 5 models to make predictions
            predicted_scores_list = []
            win_probability_list = []
            for model in models:
                predicted_scores, win_probability = model.predict(features)
                predicted_scores_list.append(predicted_scores.flatten())
                win_probability_list.append(win_probability.flatten())

            # Calculate the average predictions from the top 5 models
            predicted_scores = np.mean(predicted_scores_list, axis=0)
            win_probability = np.mean(win_probability_list, axis=0)

            # Get the team information from the game_info_dict using the GameID
            game_info = game_info_dict.get(game['GameID'], {})

            # Add the game information and predictions to the list
            predictions.append({
                'HomeTeam': game_info.get('HomeTeamName', ''),
                'HomeTeamAlias': game_info.get('HomeTeamAlias', ''),
                'HomeTeamPrimaryColor': game_info.get('HomeTeamPrimaryColor', ''),
                'HomeTeamSecondaryColor': game_info.get('HomeTeamSecondaryColor', ''),
                'AwayTeam': game_info.get('AwayTeamName', ''),
                'AwayTeamAlias': game_info.get('AwayTeamAlias', ''),
                'AwayTeamPrimaryColor': game_info.get('AwayTeamPrimaryColor', ''),
                'AwayTeamSecondaryColor': game_info.get('AwayTeamSecondaryColor', ''),
                'HomeTeamWins': game_info.get('HomeTeamWins', ''),
                'AwayTeamWins': game_info.get('AwayTeamWins', ''),
                'HomeTeamLosses': game_info.get('HomeTeamLosses', ''),
                'AwayTeamLosses': game_info.get('AwayTeamLosses', ''),
                'HomeTeamDivision': game_info.get('HomeTeamDivision', ''),
                'AwayTeamDivision': game_info.get('AwayTeamDivision', ''),
                'ActualHomeScore': game_info.get('HomePoints', ''),
                'ActualAwayScore': game_info.get('AwayPoints', ''),
                'PredictedHomeScore': float(predicted_scores[0]),
                'PredictedAwayScore': float(predicted_scores[1]),
                'HomeWinProbability': float(win_probability[0])
            })
        except (ValueError, IndexError):
            # Skip the game if there's an issue with the predictions
            continue

    predictions_data[week_str] = predictions

# Save the predictions to a JSON file
with open('predictions.json', 'w') as file:
    json.dump(predictions_data, file, indent=4)

print("Predictions have been saved to 'predictions.json'.")