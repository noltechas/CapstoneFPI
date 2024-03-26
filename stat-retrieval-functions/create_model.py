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
from keras.regularizers import l2, l1, l1_l2
from keras.callbacks import EarlyStopping
from sklearn.linear_model import LassoCV
from keras.layers import BatchNormalization
import tensorflow as tf
from keras.losses import BinaryCrossentropy


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
        if (pre_2023_period) or (not pre_2023_period and int(game['Season']) >= 2023):
            game_feature = [
                float(game['Season']) - 2014.0,
                float(game['Week']),
                float(game['HomeStats'][0]['division'] == "FBS"),
                float(game['AwayStats'][0]['division'] == "FBS")
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


def load_data(filename):
    with open(filename, 'r') as file:
        data = json.load(file)
    return data


def custom_loss(y_true, y_pred):
    # Calculate the base loss, e.g., binary cross-entropy
    base_loss = tf.keras.losses.binary_crossentropy(y_true, y_pred)

    # Calculate a direction correctness factor (1 if correct, less if incorrect)
    direction_factor = tf.where(
        tf.equal(tf.round(y_true), tf.round(y_pred)),
        1.00,  # No adjustment if direction is correct
        0.65   # Reduce penalty if direction is incorrect
    )

    # Apply the adjustment factor to the base loss
    return base_loss * direction_factor

def bucket_loss(y_true, y_pred):
    # Calculate the base loss, e.g., binary cross-entropy
    base_loss = tf.keras.losses.binary_crossentropy(y_true, y_pred)

    # Calculate the predicted win rate
    predicted_win_rate = tf.reduce_mean(y_pred)

    # Calculate the actual win rate
    actual_win_rate = tf.reduce_mean(y_true)

    # Calculate the penalty based on the difference between predicted and actual win rates
    penalty = tf.square(predicted_win_rate - actual_win_rate)

    # Apply the penalty to the base loss
    loss = base_loss + penalty

    return tf.reduce_mean(loss)


def weighted_binary_crossentropy(y_true, y_pred):
    prior_probability = 0.57
    weights = y_true * (1 - prior_probability) + (1 - y_true) * prior_probability

    # Apply the weights to the binary cross-entropy loss
    bce = BinaryCrossentropy(from_logits=False)
    weighted_bce = bce(y_true, y_pred, sample_weight=weights)

    return weighted_bce


def create_combined_model(input_shape, reg_strength):
    inputs = Input(shape=(input_shape,))

    # Shared layers
    x = Dense(16, activation='relu', kernel_regularizer=l2(reg_strength))(inputs)

    # Separate paths
    scores_path = Dropout(0.5)(x)
    scores_path = Dense(32, activation='relu', kernel_regularizer=l2(reg_strength))(scores_path)
    scores_path = Dropout(0.5)(scores_path)
    scores_path = Dense(64, activation='relu', kernel_regularizer=l2(reg_strength))(scores_path)
    scores_path = Dropout(0.5)(scores_path)
    scores_output = Dense(2, activation='relu', name='scores_output')(scores_path)

    win_chance_path = Dropout(0.75)(x)
    win_chance_path = Dense(32, activation='relu', kernel_regularizer=l2(reg_strength))(win_chance_path)
    win_chance_path = Dropout(0.8)(win_chance_path)
    win_chance_output = Dense(1, activation='sigmoid', name='win_chance_output')(win_chance_path)

    # Create a model with inputs and two outputs
    model = Model(inputs=inputs, outputs=[scores_output, win_chance_output])

    # Compile the model
    model.compile(optimizer=Adam(),
                  loss={'scores_output': 'mse', 'win_chance_output': 'binary_crossentropy'},
                  metrics={'scores_output': 'mae', 'win_chance_output': 'accuracy'},
                  loss_weights={'scores_output': 0.5, 'win_chance_output': 1.0})

    return model


def rolling_average(data, window_size=100):
    return np.convolve(data, np.ones(window_size) / window_size, mode='valid')


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


def cross_validate_regularization(X_train, y_train_scores, y_train_win_chance, X_val, y_val_scores, y_val_win_chance, reg_strengths):
    best_reg_strength = None
    best_val_loss = float('inf')

    for reg_strength in reg_strengths:
        model = create_combined_model(X_train.shape[1], reg_strength)

        # Early stopping to prevent overfitting
        early_stopping = EarlyStopping(monitor='val_loss', patience=100, restore_best_weights=True)

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
                            epochs=250000, batch_size=64, callbacks=[early_stopping])

        val_loss = history.history['val_loss'][-1]
        if val_loss < best_val_loss:
            best_reg_strength = reg_strength
            best_val_loss = val_loss

    print(f'Best regularization strength: {best_reg_strength}')
    return best_reg_strength


def train_combined_model(X_train, y_train_scores, y_train_win_chance, X_val, y_val_scores, y_val_win_chance):
    # reg_strengths = [0.01, 0.05, 0.1, 0.15, 0.25, 0.11, 0.075, 0.125, 0.375, 0.5, 1.0]  # Example regularization strengths to try
    # best_reg_strength = cross_validate_regularization(X_train, y_train_scores, y_train_win_chance, X_val, y_val_scores, y_val_win_chance, reg_strengths)

    model = create_combined_model(X_train.shape[1], 0.11)

    # Early stopping to prevent overfitting
    early_stopping = EarlyStopping(monitor='val_loss', patience=100, restore_best_weights=True)
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
                        epochs=250000, batch_size=64, callbacks=[early_stopping, average_metrics_callback])

    return model, history

def predict_game_outcome(model, game_data):
    # Assuming game_data is already processed and scaled
    predictions = model.predict(game_data)
    return predictions


def rolling_average(data, window_size):
    """Calculate the rolling average of the given data."""
    return np.convolve(data, np.ones(window_size) / window_size, mode='valid')


def plot_model_history(history, title='', window_size=25):
    # Filter out keys that are validation metrics
    validation_metrics = [key for key in history.history.keys() if key.startswith('val_')]

    for metric in validation_metrics:
        metric_name = metric.replace('val_', '')

        plt.figure(figsize=(10, 4))

        # Calculate rolling average for smoother curves
        val_metric_rolling = rolling_average(history.history[metric], window_size)

        plt.plot(val_metric_rolling, label=f'Validation {metric_name.replace("_", " ").title()} Rolling Avg',
                 color='blue')

        plt.title(f'{title} Validation {metric_name.replace("_", " ").title()} (Rolling Avg)')
        plt.xlabel('Epochs')
        plt.ylabel(metric_name.replace('_', ' ').title())
        plt.legend()
        plt.show()


def load_and_predict_all_games(X_scaled, y_scores, y_win_chance, combined_model, scaler):
    # Define the spread categories
    bucket_ranges = [
        (0.0, 3.5),
        (3.5, 7.5),
        (7.5, 10.5),
        (10.5, 14.5),
        (14.5, 17.5),
        (17.5, 21.5),
        (21.5, 24.5),
        (24.5, 28.5),
        (28.5, 35.5),
        (35.5, 42.5),
        (42.5, 49.5),
        (49.5, 56.5),
        (56.5, float('inf'))
    ]

    # Create the buckets dictionary
    buckets = {
        f"{low}-{high if high != float('inf') else '56.5+'}": {'range': (low, high), 'games': 0, 'wins': 0}
        for low, high in bucket_ranges
    }

    win_chance_buckets = [
        (0, 0.05), (0.05, 0.1), (0.1, 0.15), (0.15, 0.2),
        (0.2, 0.25), (0.25, 0.3), (0.3, 0.35),
        (0.35, 0.4), (0.4, 0.45), (0.45, 0.5), (0.5, 0.55),
        (0.55, 0.6), (0.6, 0.65), (0.65, 0.7), (0.7, 0.75),
        (0.75, 0.8), (0.8, 0.85), (0.85, 0.9), (0.9, 0.95),
        (0.95, 1)
    ]

    win_chance_stats = {bucket_range: {'games': 0, 'wins': 0} for bucket_range in win_chance_buckets}

    # Here you would loop through your predictions, classify them into these buckets based on their win chance,
    # and update `win_chance_stats` accordingly with your game outcomes.

    # Predict the outcomes using the provided scaled data
    predictions = combined_model.predict(X_scaled)

    # Unpack predictions
    predicted_scores = predictions[0]
    predicted_win_chance = predictions[1].flatten()

    # Initialize counters for total games and total wins
    total_games = len(predicted_scores)
    total_wins = 0

    # Prepare the list to sort the games
    games_sorted = list(zip(predicted_scores, y_scores, predicted_win_chance))

    # Sort games by predicted home team margin
    games_sorted.sort(key=lambda x: x[0][0] - x[0][1])

    for i, (predicted_score, actual_score, win_chance) in enumerate(games_sorted):
        predicted_home, predicted_away = predicted_score
        actual_home, actual_away = actual_score  # Use actual_score directly
        actual_win = 1 if actual_home > actual_away else 0  # Determine actual winner

        print(f"Game {i + 1}:\n"
              f"Predicted Score - Home: {predicted_home:.2f}, Away: {predicted_away:.2f}\n"
              f"Home Win Chance: {win_chance * 100:.2f}%\n"
              f"Actual Score - Home: {actual_home}, Away: {actual_away}")

        # Determine which bucket the predicted spread falls into
        spread = abs(predicted_home - predicted_away)
        for bucket_name, bucket_info in buckets.items():
            low, high = bucket_info['range']  # Use bucket_info to access the range
            if low <= spread < high:
                bucket_info['games'] += 1
                if (actual_home > actual_away and predicted_home > predicted_away) or (
                        actual_away > actual_home and predicted_away > predicted_home):
                    bucket_info['wins'] += 1
                break

    # Calculate the wins for the sorted games
    for bucket_name, bucket_info in buckets.items():
        if bucket_info['games'] > 0:
            win_rate = (bucket_info['wins'] / bucket_info['games']) * 100
            print(f"{bucket_name}: {bucket_info['games']} games, {bucket_info['wins']} wins, {win_rate:.1f}% win rate")
            total_wins += bucket_info['wins']

    # Calculate and print the total win rate
    total_win_rate = (total_wins / total_games) * 100
    print(f"Total: {total_games} games, {total_wins} wins, {total_win_rate:.1f}% win rate\n")

    # Example prediction loop
    for i, (predicted_score, actual_score, win_chance) in enumerate(
            zip(predicted_scores, y_scores, predicted_win_chance)):
        actual_win = y_win_chance[i]  # Assuming y_win_chance contains actual win status (1 for win, 0 for loss)

        # Determine the win chance bucket
        for low, high in win_chance_buckets:
            if low <= win_chance < high:  # win_chance should already be a decimal representation
                win_chance_stats[(low, high)]['games'] += 1
                if actual_win == 1:
                    win_chance_stats[(low, high)]['wins'] += 1
                break

    # After processing all predictions, print out stats for each bucket
    for (low, high), stats in win_chance_stats.items():
        if stats['games'] > 0:
            win_rate = (stats['wins'] / stats['games']) * 100
            print(
                f"Win Chance {low * 100:.1f}%-{high * 100:.1f}% ({((low * 100 + high * 100) / 2):.1f}): {stats['games']} games, {stats['wins']} wins, Win Rate: {win_rate:.1f}%")


def save_feature_importances(coef, feature_names, filename):
    feature_importances = sorted(zip(feature_names, coef), key=lambda x: abs(x[1]), reverse=True)
    with open(filename, 'w') as f:
        for name, importance in feature_importances:
            f.write(f"{name}: {importance}\n")


# Main function to run the pipeline
def main():
    filename = 'full_game_stats_for_dnn.json'
    data = load_data(filename)

    # Preprocess data
    X, y = preprocess_data(data)

    # Split y into scores and win chance
    y_scores = y[:, :2]
    y_win_chance = y[:, 2]

    # Split data into training and validation sets
    X_train, X_val, y_train_scores, y_val_scores, y_train_win_chance, y_val_win_chance = train_test_split(
        X, y_scores, y_win_chance, test_size=0.2, random_state=random.randint(1, 99))

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)

    # Print the size of the training and validation sets
    print(f"Training set size: {X_train_scaled.shape[0]} games with {X_train_scaled.shape[1]} features each")
    print(f"Validation set size: {X_val_scaled.shape[0]} games with {X_val_scaled.shape[1]} features each")

    # Train Combined Model
    combined_model, combined_history = train_combined_model(X_train_scaled, y_train_scores, y_train_win_chance,
                                                            X_val_scaled, y_val_scores, y_val_win_chance)
    plot_model_history(combined_history, title='Combined Model')

    # Save models and scaler
    combined_model.save('combined_model.h5')
    joblib.dump(scaler, 'scaler.save')

    # Load feature names
    feature_names = load_feature_names('feature_names.txt')

    # Perform Lasso feature selection and save importances
    # home_scores_coef, away_scores_coef, win_chance_coef = lasso_feature_selection(X_train_scaled, y_train_scores, y_train_win_chance)

    # Save feature importances to files
    # save_feature_importances(home_scores_coef, feature_names, 'home_scores_feature_importances.txt')
    # save_feature_importances(away_scores_coef, feature_names, 'away_scores_feature_importances.txt')
    # save_feature_importances(win_chance_coef, feature_names, 'win_chance_feature_importances.txt')

    # Example usage with the new setup
    load_and_predict_all_games(X_val_scaled, y_val_scores, y_val_win_chance, combined_model, scaler)


if __name__ == '__main__':
    main()