import json, random, joblib
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
import numpy as np
import pandas as pd
from AverageMetrics import AverageMetrics
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from keras.models import Sequential, Model
from keras.layers import Dense, Dropout, Input
from keras.optimizers import Adam
from keras.models import load_model
from keras.regularizers import l2
from keras.callbacks import EarlyStopping
from sklearn.linear_model import LassoCV


def preprocess_data(games, pre_2023_period=True):
    features = []
    labels = []
    feature_names = []

    # Define the structure for stats we are interested in
    team_stats_fields = ['win_percentage', 'strength_of_record', 'points_per_game', 'points_allowed_per_game',
                         'total_YPG', 'turnovers_per_game', 'penalties_per_game', '3rd_down_eff',
                         'redzone_eff', 'sacks_per_game', 'interceptions_per_game', 'forced_fumbles_per_game',
                         'yards_per_play', 'yards_allowed_per_game', 'yards_allowed_per_play', 'FBS_opponent_ratio']
    player_roles = ['QB', 'RBs', 'WRs/TEs', 'Defenders', 'OLs']
    player_stats_fields = ['fumbles_per_game', 'recruiting_score', 'completion_percentage', 'passing_yards_per_game',
                           'TD_INT_ratio', 'QBR', 'rushing_yards', 'rushing_touchdowns', 'passing_touchdowns',
                           'tackles_per_game', 'sacks_per_game', 'interceptions_per_game', 'forced_fumbles_per_game',
                           'passes_defended_per_game', 'rushing_yards_per_game', 'rushing_yards_per_carry',
                           'rushing_touchdowns_per_game', 'receiving_touchdowns_per_game', 'receptions_per_game',
                           'receiving_yards_per_game', 'receiving_yards_per_catch', 'period_completed']
    max_players = {'QB': 1, 'RBs': 4, 'WRs/TEs': 7, 'Defenders': 12, 'OLs': 5}

    # Process each game
    for game in games:
        if (pre_2023_period and int(game['Season']) < 2023) or (not pre_2023_period and int(game['Season']) >= 2023):
            game_feature = [float(game['Season']), float(game['Week']), float(game['HomeStats'][0]['division'] == "FBS"),
                            float(game['AwayStats'][0]['division'] == "FBS")]
            # Aggregate stats from all periods
            for period_stats in game['HomeStats'] + game['AwayStats']:
                # Team stats
                for field in team_stats_fields:
                    game_feature.append(float(period_stats.get(field, 0)))
                # Player stats
                for role in player_roles:
                    players = period_stats.get(role, [{}]*max_players[role])
                    for i in range(max_players[role]):
                        player = players[i] if i < len(players) else {}
                        for field in player_stats_fields:
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

    X = np.array(features, dtype=float)
    y = np.array(labels, dtype=float)

    return X, y


def load_data(filename):
    with open(filename, 'r') as file:
        data = json.load(file)
    return data

def create_combined_model(input_shape):
    inputs = Input(shape=(input_shape,))
    regularizer = l2(0.05)

    # Shared layers
    x = Dense(64, activation='relu', kernel_regularizer=regularizer)(inputs)
    x = Dropout(0.15)(x)
    x = Dense(128, activation='relu', kernel_regularizer=regularizer)(x)
    x = Dropout(0.15)(x)

    # Separate paths
    scores_path = Dense(256, activation='relu', kernel_regularizer=regularizer)(x)
    scores_path = Dropout(0.15)(scores_path)
    scores_output = Dense(2, activation='linear', name='scores_output')(scores_path)

    win_chance_path = Dense(128, activation='relu', kernel_regularizer=regularizer)(x)
    win_chance_path = Dropout(0.25)(win_chance_path)  # Increased dropout for win chance path
    win_chance_output = Dense(1, activation='sigmoid', name='win_chance_output')(win_chance_path)

    # Create a model with inputs and two outputs
    model = Model(inputs=inputs, outputs=[scores_output, win_chance_output])

    # Compile the model
    model.compile(optimizer=Adam(),
                  loss={'scores_output': 'mse', 'win_chance_output': 'binary_crossentropy'},
                  metrics={'scores_output': 'mae', 'win_chance_output': 'accuracy'},
                  loss_weights={'scores_output': 1.0, 'win_chance_output': 0.5})  # Adjust loss weights if needed

    return model


def rolling_average(data, window_size=100):
    return np.convolve(data, np.ones(window_size)/window_size, mode='valid')


def load_feature_names(filename):
    with open(filename, 'r') as file:
        feature_names = [line.strip() for line in file.readlines()]
    return feature_names


def lasso_feature_selection(X_train_scaled, y_train_scores, y_train_win_chance):
    home_scores = y_train_scores[:, 0]  # Extract home scores
    away_scores = y_train_scores[:, 1]  # Extract away scores

    # Lasso for home scores
    lasso_home_scores = LassoCV(cv=5, max_iter=1000000, verbose=1, n_jobs=-1).fit(X_train_scaled, home_scores)
    home_scores_coef = lasso_home_scores.coef_

    # Lasso for away scores
    lasso_away_scores = LassoCV(cv=5, max_iter=1000000, verbose=1, n_jobs=-1).fit(X_train_scaled, away_scores)
    away_scores_coef = lasso_away_scores.coef_

    # Lasso for win chance
    lasso_win_chance = LassoCV(cv=5, max_iter=1000000, verbose=1, n_jobs=-1).fit(X_train_scaled, y_train_win_chance)
    win_chance_coef = lasso_win_chance.coef_

    return home_scores_coef, away_scores_coef, win_chance_coef

def train_combined_model(X_train, y_train_scores, y_train_win_chance, X_val, y_val_scores, y_val_win_chance):
    input_shape = X_train.shape[1]
    model = create_combined_model(input_shape)

    # Early stopping to prevent overfitting
    early_stopping = EarlyStopping(monitor='val_loss', patience=100, restore_best_weights=True)

    # Assume you have or will implement an AverageMetrics callback if necessary
    average_metrics_callback = AverageMetrics(n_epochs=100)

    # Organizing the labels for training and validation
    labels = {
        'scores_output': y_train_scores,
        'win_chance_output': y_train_win_chance
    }
    val_labels = {
        'scores_output': y_val_scores,
        'win_chance_output': y_val_win_chance
    }

    # Training the model
    history = model.fit(X_train, labels, validation_data=(X_val, val_labels),
                        epochs=2500, batch_size=64, callbacks=[early_stopping, average_metrics_callback])

    return model, history


def predict_game_outcome(model, game_data):
    # Assuming game_data is already processed and scaled
    predictions = model.predict(game_data)
    return predictions


def rolling_average(data, window_size):
    """Calculate the rolling average of the given data."""
    return np.convolve(data, np.ones(window_size)/window_size, mode='valid')


def plot_model_history(history, title='', window_size=25):
    # Filter out keys that are validation metrics
    validation_metrics = [key for key in history.history.keys() if key.startswith('val_')]

    for metric in validation_metrics:
        metric_name = metric.replace('val_', '')
        if metric_name == 'loss':  # Skip plotting loss here if you want it separate
            continue

        plt.figure(figsize=(10, 4))

        # Calculate rolling average for smoother curves
        val_metric_rolling = rolling_average(history.history[metric], window_size)

        plt.plot(val_metric_rolling, label=f'Validation {metric_name.replace("_", " ").title()} Rolling Avg', color='blue')

        plt.title(f'{title} Validation {metric_name.replace("_", " ").title()} (Rolling Avg)')
        plt.xlabel('Epochs')
        plt.ylabel(metric_name.replace('_', ' ').title())
        plt.legend()
        plt.show()


def load_and_predict_all_games(filename, model):

    # Define the spread categories
    bucket_ranges = [
        (0.5, 3),
        (3.5, 7),
        (7.5, 10),
        (10.5, 14),
        (14.5, 17),
        (17.5, 21),
        (21.5, 24),
        (24.5, 28),
        (28.5, 35),
        (35.5, 42),
        (42.5, 49),
        (49.5, 56),
        (56.5, float('inf'))
    ]

    # Create the buckets dictionary
    buckets = {
        f"{low}-{high if high != float('inf') else '56.5+'}": {'range': (low, high), 'games': 0, 'wins': 0}
        for low, high in bucket_ranges
    }

    # Load the data
    with open(filename, 'r') as file:
        games = json.load(file)

    # Assuming preprocess_data and other necessary preprocessing steps are defined elsewhere
    X, y_true = preprocess_data(games, False)

    # Load the combined model
    combined_model = load_model(model)

    # Load the saved scaler
    scaler = joblib.load('scaler.save')
    X_scaled = scaler.transform(X)

    # Predict the outcomes using the combined model for all games at once
    predictions = combined_model.predict(X_scaled)

    # Process predictions correctly based on their format
    if isinstance(predictions, dict):
        predicted_scores = predictions['scores_output']
        predicted_win_chance = predictions['win_chance_output'].flatten()
    else:
        predicted_scores = predictions[0]  # Assuming scores output comes first
        predicted_win_chance = predictions[1].flatten()  # Assuming win chance output comes second

    # Loop through the games and print predictions - no need to predict again inside the loop
    for i, (score, win_chance) in enumerate(zip(predicted_scores, predicted_win_chance)):
        actual_score = y_true[i][:2]  # Assuming y_true structure [actual_home_score, actual_away_score, actual_win]
        print(f"Game {i + 1}:\n"
              f"Predicted Score - Home: {score[0]:.2f}, Away: {score[1]:.2f}\n"
              f"Home Win Chance: {win_chance * 100:.2f}%\n"
              f"Actual Score - Home: {actual_score[0]}, Away: {actual_score[1]}")

    # Sort games by predicted home team margin
    games_sorted = sorted(
        zip(games, predicted_scores, y_true),
        key=lambda x: x[1][0] - x[1][1]
    )

    # Initialize variables for tracking the wins
    win_counts = {bucket: {'games': 0, 'wins': 0} for bucket in buckets.keys()}

    # Iterate over the sorted games
    for game, pred, true in games_sorted:
        pred_home, pred_away = pred
        actual_home, actual_away, actual_win = true
        spread = abs(pred_home - pred_away)
        for bucket_range, bucket_name in zip(bucket_ranges, buckets.keys()):
            low, high = bucket_range
            if low <= spread < high:
                win_counts[bucket_name]['games'] += 1
                if actual_win == 1 and pred_home > pred_away:  # Home win
                    win_counts[bucket_name]['wins'] += 1
                elif actual_win == 0 and pred_away > pred_home:  # Away win
                    win_counts[bucket_name]['wins'] += 1

    # Sort the win counts for printing
    sorted_win_counts = sorted(
        win_counts.items(),
        key=lambda x: sum(buckets[x[0]]['range']) / 2 if buckets[x[0]]['range'][1] != float('inf') else float('inf')
    )

    # Print the games in ascending order based on how much the model favors the home team
    # Initialize counters for total games and total wins
    total_games = 0
    total_wins = 0

    # Iterate through each bucket to print its win rate and update total counters
    for bucket_name, count_data in sorted_win_counts:
        if count_data['games'] > 0:
            print(f"{bucket_name}: {count_data['games']} games, {count_data['wins']} wins, {count_data['wins']/count_data['games']*100:.1f}% win rate")
            total_games += count_data['games']
            total_wins += count_data['wins']

    # Calculate and print the total win rate if there are any games
    if total_games > 0:
        total_win_rate = (total_wins / total_games) * 100
        print(f"Total: {total_games} games, {total_wins} wins, {total_win_rate:.1f}% win rate")
    else:
        print("No games to calculate a total win rate.")


def save_feature_importances(coef, feature_names, filename):
    feature_importances = sorted(zip(feature_names, coef), key=lambda x: abs(x[1]), reverse=True)
    with open(filename, 'w') as f:
        for name, importance in feature_importances:
            f.write(f"{name}: {importance}\n")


# Main function to run the pipeline
def main():
    filename = 'game_stats_for_dnn.json'
    data = load_data(filename)

    # Preprocess data
    X, y = preprocess_data(data)

    # Split y into scores and win chance
    y_scores = y[:, :2]
    y_win_chance = y[:, 2]

    # Split data into training and validation sets
    X_train, X_val, y_train_scores, y_val_scores, y_train_win_chance, y_val_win_chance = train_test_split(
        X, y_scores, y_win_chance, test_size=0.2, random_state=42)

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)

    # Print the size of the training and validation sets
    print(f"Training set size: {X_train_scaled.shape[0]} games with {X_train_scaled.shape[1]} features each")
    print(f"Validation set size: {X_val_scaled.shape[0]} games with {X_val_scaled.shape[1]} features each")

    # Train Combined Model
    combined_model, combined_history = train_combined_model(X_train_scaled, y_train_scores, y_train_win_chance, X_val_scaled, y_val_scores, y_val_win_chance)
    plot_model_history(combined_history, title='Combined Model')

    # Save models and scaler
    combined_model.save('combined_model.h5')
    joblib.dump(scaler, 'scaler.save')

    # Load feature names
    feature_names = load_feature_names('feature_names.txt')

    # Perform Lasso feature selection and save importances
    home_scores_coef, away_scores_coef, win_chance_coef = lasso_feature_selection(X_train_scaled, y_train_scores, y_train_win_chance)

    # Save feature importances to files
    save_feature_importances(home_scores_coef, feature_names, 'home_scores_feature_importances.txt')
    save_feature_importances(away_scores_coef, feature_names, 'away_scores_feature_importances.txt')
    save_feature_importances(win_chance_coef, feature_names, 'win_chance_feature_importances.txt')

    # Example usage with the new setup
    load_and_predict_all_games('game_stats_for_dnn.json', 'combined_model.h5')


if __name__ == '__main__':
    main()