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
                           'receiving_yards_per_game', 'receiving_yards_per_catch']
    max_players = {'QB': 1, 'RBs': 4, 'WRs/TEs': 7, 'Defenders': 12, 'OLs': 5}

    # Prepare feature names
    for team in ["Home", "Away"]:
        for stat in team_stats_fields:
            feature_names.append(f"{team}_{stat}")
        for role, count in max_players.items():
            for i in range(count):
                for stat in player_stats_fields:
                    feature_names.append(f"{team}_{role}_{i}_{stat}")

    # Process each game
    for game in games:
        if (pre_2023_period and int(game['Season']) < 2023) or (not pre_2023_period and int(game['Season']) >= 2023):
            game_feature = [float(game['Season']), float(game['Week'])]
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


def create_scores_model(input_shape):
    inputs = Input(shape=(input_shape,))
    regularizer = l2(0.05)

    x = Dense(64, activation='relu', kernel_regularizer=regularizer)(inputs)
    x = Dropout(0.15)(x)
    x = Dense(128, activation='relu', kernel_regularizer=regularizer)(x)
    x = Dropout(0.15)(x)
    x = Dense(256, activation='relu', kernel_regularizer=regularizer)(x)
    x = Dropout(0.15)(x)
    x = Dense(512, activation='relu', kernel_regularizer=regularizer)(x)
    x = Dropout(0.15)(x)
    x = Dense(1024, activation='relu', kernel_regularizer=regularizer)(x)

    # Only one output for scores prediction
    scores_output = Dense(2, activation='linear', name='scores_output')(x)

    model = Model(inputs=inputs, outputs=scores_output)
    model.compile(optimizer=Adam(), loss='mse', metrics=['mae'])

    return model


def create_win_chance_model(input_shape):
    inputs = Input(shape=(input_shape,))
    regularizer = l2(0.05)

    x = Dense(64, activation='relu', kernel_regularizer=regularizer)(inputs)
    x = Dropout(0.15)(x)
    x = Dense(128, activation='relu', kernel_regularizer=regularizer)(x)
    x = Dropout(0.15)(x)
    x = Dense(256, activation='relu', kernel_regularizer=regularizer)(x)


    # Only one output for win chance prediction with sigmoid activation for a probability
    win_chance_output = Dense(1, activation='sigmoid', name='win_chance_output')(x)

    model = Model(inputs=inputs, outputs=win_chance_output)
    model.compile(optimizer=Adam(), loss='binary_crossentropy', metrics=['accuracy'])

    return model


def rolling_average(values, window_size=100):
    """Compute rolling average of a list of values, considering the specified window size."""
    if len(values) < window_size:
        # If there are not enough values, compute average of available values
        return np.mean(values)
    return np.mean(values[-window_size:])


def lasso_feature_selection(X, y_scores, y_win_chance):
    # Enable verbose output
    lasso_scores = LassoCV(cv=5, max_iter=1000000, verbose=1).fit(X, y_scores)
    scores_coef = lasso_scores.coef_

    lasso_win_chance = LassoCV(cv=5, max_iter=1000000, verbose=1).fit(X, y_win_chance)
    win_chance_coef = lasso_win_chance.coef_

    return scores_coef, win_chance_coef


def train_scores_model(X_train, y_train_scores, X_val, y_val_scores):
    model = create_scores_model(X_train.shape[1])
    early_stopping = EarlyStopping(monitor='val_loss', patience=200, restore_best_weights=True)
    average_metrics_callback = AverageMetrics(n_epochs=50)

    history = model.fit(X_train, y_train_scores, validation_data=(X_val, y_val_scores),
                        epochs=2500, batch_size=64, callbacks=[early_stopping, average_metrics_callback])

    return model, history


def train_win_chance_model(X_train, y_train_win_chance, X_val, y_val_win_chance):
    model = create_win_chance_model(X_train.shape[1])
    early_stopping = EarlyStopping(monitor='val_loss', patience=100, restore_best_weights=True)
    average_metrics_callback = AverageMetrics(n_epochs=50)

    history = model.fit(X_train, y_train_win_chance, validation_data=(X_val, y_val_win_chance),
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
    plt.figure(figsize=(12, 6))

    # Plot Loss with rolling average
    plt.subplot(1, 2, 1)
    train_loss_rolling = rolling_average(history.history['loss'], window_size)
    val_loss_rolling = rolling_average(history.history['val_loss'], window_size)
    plt.plot(train_loss_rolling, label='Train Loss Rolling Avg')
    plt.plot(val_loss_rolling, label='Val Loss Rolling Avg')
    plt.title(f'{title} Loss (Rolling Avg)')
    plt.xlabel('Epochs')
    plt.ylabel('Loss')
    plt.legend()

    # Plot Accuracy or MAE with rolling average
    if 'accuracy' in history.history:
        plt.subplot(1, 2, 2)
        train_accuracy_rolling = rolling_average(history.history['accuracy'], window_size)
        val_accuracy_rolling = rolling_average(history.history['val_accuracy'], window_size)
        plt.plot(train_accuracy_rolling, label='Train Accuracy Rolling Avg')
        plt.plot(val_accuracy_rolling, label='Val Accuracy Rolling Avg')
        plt.title(f'{title} Accuracy (Rolling Avg)')
        plt.xlabel('Epochs')
        plt.ylabel('Accuracy')
    else:
        plt.subplot(1, 2, 2)
        train_mae_rolling = rolling_average(history.history['mae'], window_size)
        val_mae_rolling = rolling_average(history.history['val_mae'], window_size)
        plt.plot(train_mae_rolling, label='Train MAE Rolling Avg')
        plt.plot(val_mae_rolling, label='Val MAE Rolling Avg')
        plt.title(f'{title} MAE (Rolling Avg)')
        plt.xlabel('Epochs')
        plt.ylabel('MAE')
    plt.legend()
    plt.show()


def load_and_predict_all_games(filename, scores_model_filename, win_chance_model_filename):

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

    # Preprocess the data
    X, y_true = preprocess_data(games, False)

    # Load the saved models
    scores_model = load_model(scores_model_filename)
    win_chance_model = load_model(win_chance_model_filename)

    # Load the saved scaler
    scaler = joblib.load('scaler.save')
    X_scaled = scaler.transform(X)

    # Predict the outcomes
    predicted_scores = scores_model.predict(X_scaled)
    predicted_win_chance = win_chance_model.predict(X_scaled).flatten()

    # Sort games by predicted home team margin
    games_sorted = sorted(
        zip(games, predicted_scores, y_true),
        key=lambda x: x[1][0] - x[1][1]
    )

    # Ensure iteration is within bounds of predicted_scores
    num_predictions = len(predicted_scores)

    # Iterate over each game within the bound and print the predicted and actual scores
    for i in range(num_predictions):
        predicted_score = predicted_scores[i]
        actual_score = y_true[i][:2]  # Assuming the actual scores are the first two elements in y_true
        print(f"Game {i + 1}:\n Predicted Score - Home: {predicted_score[0]:.2f}, Away: {predicted_score[1]:.2f}\n"
              f"Actual Score - Home: {actual_score[0]}, Away: {actual_score[1]}")

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
    # Pair feature names with coefficients
    feature_importances = sorted(zip(feature_names, coef), key=lambda x: abs(x[1]), reverse=True)
    # Write to file
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
    print(f"Training set size: {X_train_scaled.shape[0]} games")
    print(f"Validation set size: {X_val_scaled.shape[0]} games")

    # Train Scores Model
    scores_model, scores_history = train_scores_model(X_train_scaled, y_train_scores, X_val_scaled, y_val_scores)
    plot_model_history(scores_history, title='Scores Model')

    # Train Win Chance Model
    win_chance_model, win_chance_history = train_win_chance_model(X_train_scaled, y_train_win_chance, X_val_scaled, y_val_win_chance)
    plot_model_history(win_chance_history, title='Win Chance Model')

    # Save models and scaler
    scores_model.save('scores_prediction_model.h5')
    win_chance_model.save('win_chance_prediction_model.h5')
    joblib.dump(scaler, 'scaler.save')

    # Example usage with the new setup
    filename = 'game_stats_for_dnn.json'
    scores_model_filename = 'scores_prediction_model.h5'
    win_chance_model_filename = 'win_chance_prediction_model.h5'
    load_and_predict_all_games(filename, scores_model_filename, win_chance_model_filename)


if __name__ == '__main__':
    main()
