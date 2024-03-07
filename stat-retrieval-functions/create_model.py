import json, random
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from keras.models import Sequential, Model
from keras.layers import Dense, Dropout, Input
from keras.optimizers import Adam

def preprocess_data(games):
    features = []
    labels = []

    # Define maximum numbers for player stats to be considered
    max_players = {
        'QB': 1, 'RBs': 4, 'WRs/TEs': 7, 'Defenders': 12, 'OLs': 5
    }

    for game in games:
        game_features = [
            float(game['Season']),
            float(game['Week']),
        ]

        def add_period_stats(period_stats, max_players):
            team_stats_fields = ['win_percentage', 'strength_of_record', 'points_per_game', 'points_allowed_per_game', 'total_YPG', 'turnovers_per_game', 'penalties_per_game', '3rd_down_eff', 'redzone_eff', 'sacks_per_game', 'interceptions_per_game', 'forced_fumbles_per_game', 'yards_per_play', 'yards_allowed_per_game', 'yards_allowed_per_play', 'FBS_opponent_ratio']
            for field in team_stats_fields:
                if field == 'division':
                    # Convert "FBS" to 1 and "FCS" to 0
                    game_features.append(1 if period_stats.get(field, 'FBS') == 'FBS' else 0)
                else:
                    game_features.append(float(period_stats.get(field, 0)))

            player_roles = ['QB', 'RBs', 'WRs/TEs', 'Defenders', 'OLs']
            player_stats_fields = ['fumbles_per_game', 'recruiting_score', 'completion_percentage', 'passing_yards_per_game', 'TD_INT_ratio', 'QBR', 'rushing_yards', 'rushing_touchdowns', 'passing_touchdowns', 'tackles_per_game', 'sacks_per_game', 'interceptions_per_game', 'forced_fumbles_per_game', 'passes_defended_per_game', 'rushing_yards_per_game', 'rushing_yards_per_carry', 'rushing_touchdowns_per_game', 'receiving_touchdowns_per_game', 'receptions_per_game', 'receiving_yards_per_game', 'receiving_yards_per_catch']

            for role in player_roles:
                players = period_stats.get(role, [])
                for i in range(max_players[role]):
                    player = players[i] if i < len(players) else {}
                    for field in player_stats_fields:
                        if field == 'period_completed':
                            # Convert "True" or "False" to 1 or 0
                            game_features.append(1 if player.get(field, True) == 'True' else 0)
                        else:
                            game_features.append(float(player.get(field, 0)))

        for period_stats in game['HomeStats']:
            add_period_stats(period_stats, max_players)
        for period_stats in game['AwayStats']:
            add_period_stats(period_stats, max_players)

        home_points = float(game['HomePoints'])
        away_points = float(game['AwayPoints'])
        home_win_percentage = 0
        if home_points > away_points:
            home_win_percentage = 1

        features.append(game_features)
        labels.append([home_points, away_points, home_win_percentage])

    # Convert features and labels to NumPy arrays of type float
    X = np.array(features, dtype=float)
    y = np.array(labels, dtype=float)
    return X, y

# Load and preprocess data
def load_data(filename):
    with open(filename, 'r') as file:
        data = json.load(file)
    return data

def create_model(input_shape):
    # Define the input layer with the shape of your features
    inputs = Input(shape=(input_shape,))

    # Build the neural network layers
    x = Dense(16, activation='relu')(inputs)
    x = Dropout(0.1)(x)
    x = Dense(32, activation='relu')(x)
    x = Dropout(0.2)(x)
    x = Dense(64, activation='relu')(x)
    x = Dropout(0.3)(x)
    x = Dense(128, activation='relu')(x)
    x = Dropout(0.4)(x)
    x = Dense(256, activation='relu')(x)
    x = Dropout(0.5)(x)
    x = Dense(512, activation='relu')(x)

    # Define two outputs for the scores prediction
    scores_output = Dense(2, activation='linear', name='scores_output')(x)
    # Define one output for the win chance prediction with sigmoid activation for a probability
    win_chance_output = Dense(1, activation='sigmoid', name='win_chance_output')(x)

    # Define the model with its input and outputs
    model = Model(inputs=inputs, outputs=[scores_output, win_chance_output])

    # Compile the model with different loss functions for each output and add metrics for monitoring
    model.compile(optimizer=Adam(),
                  loss={'scores_output': 'mse', 'win_chance_output': 'binary_crossentropy'},
                  metrics={'scores_output': ['mae'], 'win_chance_output': ['accuracy']},
                  loss_weights={'scores_output': 1.0, 'win_chance_output': 1.0})  # Adjust loss weights as needed

    return model

def create_model_flipped(input_shape):
    # Define the input layer with the shape of your features
    inputs = Input(shape=(input_shape,))

    # Build the neural network layers
    x = Dense(512, activation='relu')(inputs)
    x = Dropout(0.5)(x)
    x = Dense(256, activation='relu')(x)
    x = Dropout(0.4)(x)
    x = Dense(128, activation='relu')(x)
    x = Dropout(0.3)(x)
    x = Dense(64, activation='relu')(x)
    x = Dropout(0.2)(x)
    x = Dense(32, activation='relu')(x)
    x = Dropout(0.1)(x)
    x = Dense(16, activation='relu')(x)

    # Define two outputs for the scores prediction
    scores_output = Dense(2, activation='linear', name='scores_output')(x)
    # Define one output for the win chance prediction with sigmoid activation for a probability
    win_chance_output = Dense(1, activation='sigmoid', name='win_chance_output')(x)

    # Define the model with its input and outputs
    model = Model(inputs=inputs, outputs=[scores_output, win_chance_output])

    # Compile the model with different loss functions for each output and add metrics for monitoring
    model.compile(optimizer=Adam(),
                  loss={'scores_output': 'mse', 'win_chance_output': 'binary_crossentropy'},
                  metrics={'scores_output': ['mae'], 'win_chance_output': ['accuracy']},
                  loss_weights={'scores_output': 1.0, 'win_chance_output': 1.0})  # Adjust loss weights as needed

    return model

def train_model(X_train, y_train, X_val, y_val):
    # Split y_train and y_val into separate targets for each output
    y_train_scores = y_train[:, :2]  # First two columns for scores
    y_train_win_chance = y_train[:, 2]  # Third column for win chance

    y_val_scores = y_val[:, :2]  # First two columns for scores
    y_val_win_chance = y_val[:, 2]  # Third column for win chance

    model = create_model_flipped(X_train.shape[1])

    # Adjust model.fit to accept a dictionary matching output names to their data
    history = model.fit(
        X_train,
        {'scores_output': y_train_scores, 'win_chance_output': y_train_win_chance},
        validation_data=(X_val, {'scores_output': y_val_scores, 'win_chance_output': y_val_win_chance}),
        epochs=2500,
        batch_size=64
    )

    return model, history

def select_random_game(schedule_filename):
    with open(schedule_filename, 'r') as file:
        schedule = json.load(file)
    random_game = random.choice(schedule)  # Adjust according to the structure of your schedule file
    # Print only the home and away points
    print(f"HomePoints: {random_game['HomePoints']}, AwayPoints: {random_game['AwayPoints']}")
    return [random_game]  # Wrap it in a list to match the expected input format for preprocess_data

def predict_game_outcome(model, game_data):
    # Assuming game_data is already processed and scaled
    predictions = model.predict(game_data)
    return predictions


# Main function to run the pipeline
def main():
    filename = 'game_stats_for_dnn.json'
    data = load_data(filename)

    # Preprocess data
    X, y = preprocess_data(data)

    # Ensure X is 2D and y is 2D
    print("Shape of X:", X.shape)
    print("Shape of y:", y.shape)

    # Print the total number of games used for training and validation
    print(f"Total number of games for training and validation: {X.shape[0]}")

    # Split data into training and validation sets
    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

    # Print the number of games in training and validation sets
    print(f"Number of games in training set: {X_train.shape[0]}")
    print(f"Number of games in validation set: {X_val.shape[0]}")

    # Ensure the input to the model is correct
    print("Shape of X_train:", X_train.shape)
    print("Shape of X_val:", X_val.shape)

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)

    # Train model
    model, history = train_model(X_train_scaled, y_train, X_val_scaled, y_val)

    # Save model for later use
    model.save('game_prediction_model.h5')

    # Select a random game from the schedule
    random_game = select_random_game('game_stats_for_dnn.json')
    random_game_processed, _ = preprocess_data(random_game)  # Labels are not needed for prediction

    # Scale the features of the random game using the same scaler
    # IMPORTANT: You must save the scaler after fitting on your training data and load it here to transform
    random_game_scaled = scaler.transform(random_game_processed)

    # Predict the outcome of the random game
    prediction = predict_game_outcome(model, random_game_scaled)
    # Assuming prediction returns a list of arrays like the one mentioned
    predicted_scores, predicted_win_chance = prediction

    # Extract score predictions
    predicted_home_score = predicted_scores[0][0]
    predicted_away_score = predicted_scores[0][1]

    # Extract win chance prediction
    predicted_home_win_chance = predicted_win_chance[0][0]

    # Format the predictions into a readable string
    prediction_str = f"Prediction (HomePoints, AwayPoints, HomeWinChance): ({predicted_home_score:.2f}, {predicted_away_score:.2f}, {predicted_home_win_chance:.4f})"

    print(prediction_str)




if __name__ == '__main__':
    main()
